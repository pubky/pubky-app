import { createCrawler } from './crawler';
import type { StoreChange } from './crawler.types';
import { IndexerAbortedError, IndexerError } from './indexer.errors';
import {
  type CoordinationMessage,
  type CrawlRequest,
  DEFAULT_RUNTIME_OPTIONS,
  type IndexerRuntime,
  type RuntimeParams,
  type RuntimeStatus,
  type Schedule,
} from './runtime.types';
import { scopeId } from './store.helpers';
import type { ScopeKey } from './store.types';

const LOCK_PREFIX = 'pubky-indexer:';

const defaultSchedule: Schedule = (callback, ms) => {
  const timer = setTimeout(callback, ms);
  return () => clearTimeout(timer);
};

const asError = (error: unknown): Error => (error instanceof Error ? error : new Error(String(error)));

/** Both changes in one, each scope and seed once. */
function mergeChanges(a: StoreChange, b: StoreChange): StoreChange {
  const scopes = new Map(a.scopes.map((scope): [string, ScopeKey] => [scopeId(scope), scope]));
  for (const scope of b.scopes) scopes.set(scopeId(scope), scope);
  return { scopes: [...scopes.values()], seeds: [...new Set([...a.seeds, ...b.seeds])] };
}

interface Task {
  request: CrawlRequest;
  resolve: () => void;
  reject: (error: unknown) => void;
  /** Asked by another tab, which asks the next crawling tab again if this one steps down. */
  remote: boolean;
}

interface Ensured {
  promise: Promise<void>;
  settledAt: number | null;
}

const noop = () => undefined;

export function createIndexerRuntime<D>(params: RuntimeParams<D>): IndexerRuntime {
  const { transport, store, domain, now } = params;
  const schedule = params.schedule ?? defaultSchedule;
  const coordination = params.coordination ?? null;
  const options = { ...DEFAULT_RUNTIME_OPTIONS, ...params.options };
  const crawler = createCrawler({ transport, store, domain, now, options: options.crawler });
  const tab = Math.random().toString(36).slice(2);

  let seed: string | null = null;
  let started = false;
  let paused = false;
  /** Whether this runtime may crawl: always while running alone, only while holding the lock otherwise. */
  let leading = false;
  let controller = new AbortController();
  let running: Promise<void> | null = null;
  let queue: Task[] = [];
  let periodicDue = false;
  let cancelTimer: (() => void) | null = null;
  let releaseLock: (() => void) | null = null;
  let unsubscribe: (() => void) | null = null;
  let pendingChange: StoreChange | null = null;
  let cancelFlush: (() => void) | null = null;
  let lastSyncAt: number | null = null;
  let lastError: Error | null = null;
  let nextId = 0;
  const waitingFor = new Set<string>();
  /** This tab's requests sent to the crawling tab, by id. */
  const forwarded = new Map<string, Task>();
  const ensured = new Map<string, Ensured>();
  const changeListeners = new Set<(change: StoreChange) => void>();
  const statusListeners = new Set<(status: RuntimeStatus) => void>();

  const status = (): RuntimeStatus => ({
    state: !started ? 'stopped' : running !== null ? 'syncing' : lastError !== null ? 'error' : 'idle',
    seed,
    lastSyncAt,
    lastError,
    stats: crawler.stats(),
  });
  const emitStatus = () => {
    const snapshot = status();
    for (const listener of statusListeners) listener(snapshot);
  };
  crawler.subscribe(emitStatus);

  function flushChange() {
    cancelFlush = null;
    const change = pendingChange;
    pendingChange = null;
    if (change !== null) for (const listener of changeListeners) listener(change);
  }

  function noteChange(change: StoreChange) {
    pendingChange = pendingChange === null ? change : mergeChanges(pendingChange, change);
    if (cancelFlush === null) cancelFlush = schedule(flushChange, options.changeDebounceMs);
  }

  crawler.onCommit((change) => {
    noteChange(change);
    coordination?.post({ type: 'changed', change });
  });

  const canCrawl = () => started && !paused && leading;

  function scheduleSync(delay: number) {
    cancelTimer?.();
    cancelTimer = null;
    if (!canCrawl()) return;
    cancelTimer = schedule(() => {
      cancelTimer = null;
      periodicDue = true;
      pump();
    }, delay);
  }

  async function crawl(request: CrawlRequest, current: string, signal: AbortSignal): Promise<void> {
    switch (request.kind) {
      case 'scope':
        await crawler.syncScope(current, signal);
        return;
      case 'users':
        await crawler.syncUsers(request.users, signal);
        return;
      case 'leaf':
        await crawler.syncLeaf(request.leaf, signal);
        return;
      case 'backfill':
        await crawler.backfill(request.author, request.group, request.pages, signal);
        return;
    }
  }

  /** Never rejects: the outcome goes to the task, and a failure to the status. */
  async function execute(task: Task, current: string, signal: AbortSignal): Promise<void> {
    try {
      await crawl(task.request, current, signal);
      if (task.request.kind === 'scope') {
        lastSyncAt = now();
        lastError = null;
      }
      task.resolve();
    } catch (error) {
      if (!signal.aborted) lastError = asError(error);
      task.reject(error);
    }
    // A failed sync keeps the interval too.
    if (task.request.kind === 'scope') scheduleSync(options.syncIntervalMs);
  }

  function pump() {
    const current = seed;
    if (running !== null || current === null || !canCrawl()) return;
    const task: Task | undefined =
      queue.shift() ??
      (periodicDue ? { request: { kind: 'scope' }, resolve: noop, reject: noop, remote: false } : undefined);
    if (task === undefined) return;
    if (task.request.kind === 'scope') periodicDue = false;
    running = execute(task, current, controller.signal).then(() => {
      running = null;
      emitStatus();
      pump();
    });
    emitStatus();
  }

  function forward(task: Task) {
    if (coordination === null || seed === null) return;
    const id = `${tab}:${nextId}`;
    nextId += 1;
    forwarded.set(id, task);
    coordination.post({ type: 'request', seed, id, request: task.request });
  }

  function remoteTask(id: string, request: CrawlRequest): Task {
    return {
      request,
      resolve: () => coordination?.post({ type: 'settled', id, error: null }),
      // An abort means this tab stopped; the asking tab asks the next crawling tab instead.
      reject: (error) => {
        if (!(error instanceof IndexerAbortedError)) {
          coordination?.post({ type: 'settled', id, error: asError(error).message });
        }
      },
      remote: true,
    };
  }

  function lead() {
    leading = true;
    if (coordination !== null && seed !== null) {
      coordination.post({ type: 'leader', seed });
      queue.push(...forwarded.values());
      forwarded.clear();
    }
    const since = lastSyncAt === null ? Infinity : now() - lastSyncAt;
    if (since >= options.syncIntervalMs) periodicDue = true;
    else scheduleSync(options.syncIntervalMs - since);
    pump();
    emitStatus();
  }

  function seekLead() {
    const current = seed;
    if (!started || paused || leading || current === null) return;
    if (coordination === null) {
      lead();
      return;
    }
    const name = `${LOCK_PREFIX}${current}`;
    if (waitingFor.has(name)) return;
    waitingFor.add(name);
    coordination
      .runExclusive(name, () => {
        waitingFor.delete(name);
        if (!started || paused || leading || seed !== current) {
          // Granted too late: pass the lock on, and ask for the right one when the seed changed.
          seekLead();
          return Promise.resolve();
        }
        return new Promise<void>((release) => {
          releaseLock = release;
          lead();
        });
      })
      .catch((error: unknown) => {
        waitingFor.delete(name);
        lastError = asError(error);
        emitStatus();
      });
  }

  /** Stops crawling here; the lock goes once the running crawl settles. */
  function stepDown() {
    if (!leading) return;
    leading = false;
    cancelTimer?.();
    cancelTimer = null;
    periodicDue = false;
    queue = queue.filter((task) => !task.remote);
    if (coordination !== null && started) {
      for (const task of queue) forward(task);
      queue = [];
    }
    const release = releaseLock;
    releaseLock = null;
    if (release === null) return;
    if (running === null) release();
    else void running.then(release);
  }

  function onMessage(message: CoordinationMessage) {
    if (!started || seed === null) return;
    switch (message.type) {
      case 'changed':
        noteChange(message.change);
        return;
      case 'leader':
        if (message.seed !== seed) return;
        for (const [id, task] of forwarded) coordination?.post({ type: 'request', seed, id, request: task.request });
        return;
      case 'request':
        if (!leading || message.seed !== seed) return;
        queue.push(remoteTask(message.id, message.request));
        pump();
        return;
      case 'settled': {
        const task = forwarded.get(message.id);
        if (task === undefined) return;
        forwarded.delete(message.id);
        if (message.error === null) task.resolve();
        else task.reject(new IndexerError(message.error));
        return;
      }
    }
  }

  function submit(request: CrawlRequest): Promise<void> {
    if (!started) return Promise.reject(new IndexerError('the indexer is not started'));
    return new Promise<void>((resolve, reject) => {
      const task: Task = { request, resolve, reject, remote: false };
      if (coordination === null || leading) {
        queue.push(task);
        pump();
      } else {
        forward(task);
      }
    });
  }

  /** Shares the call with a pending one of the same key, or one finished less than `ttlMs` ago. */
  function ensure(key: string, request: CrawlRequest, ttlMs: number): Promise<void> {
    const known = ensured.get(key);
    if (known !== undefined && (known.settledAt === null || now() - known.settledAt < ttlMs)) return known.promise;
    const promise = submit(request);
    const entry: Ensured = { promise, settledAt: null };
    ensured.set(key, entry);
    promise.then(
      () => {
        entry.settledAt = now();
      },
      () => {
        if (ensured.get(key) === entry) ensured.delete(key);
      },
    );
    return promise;
  }

  function stop() {
    if (!started) return;
    started = false;
    controller.abort();
    stepDown();
    unsubscribe?.();
    unsubscribe = null;
    const aborted = new IndexerAbortedError();
    for (const task of queue) task.reject(aborted);
    for (const task of forwarded.values()) task.reject(aborted);
    queue = [];
    forwarded.clear();
    ensured.clear();
    cancelFlush?.();
    flushChange();
    emitStatus();
  }

  return {
    start(next) {
      if (started && seed === next) return;
      stop();
      seed = next;
      started = true;
      controller = new AbortController();
      lastSyncAt = null;
      lastError = null;
      if (coordination !== null) unsubscribe = coordination.subscribe(onMessage);
      seekLead();
      emitStatus();
    },
    stop,
    pause() {
      if (paused) return;
      paused = true;
      stepDown();
      emitStatus();
    },
    resume() {
      if (!paused) return;
      paused = false;
      seekLead();
      emitStatus();
    },
    refresh: (users) => submit(users === undefined ? { kind: 'scope' } : { kind: 'users', users: [...users] }),
    ensureUser: (user) => ensure(JSON.stringify(['user', user]), { kind: 'users', users: [user] }, options.ensureTtlMs),
    ensureLeaf: (leaf) =>
      ensure(
        JSON.stringify(['leaf', leaf.author, leaf.group]),
        { kind: 'leaf', leaf: { author: leaf.author, group: leaf.group, paths: [...leaf.paths] } },
        options.ensureTtlMs,
      ),
    backfill: (author, group, pages) =>
      ensure(JSON.stringify(['backfill', author, group, pages]), { kind: 'backfill', author, group, pages }, 0),
    onChange(listener) {
      changeListeners.add(listener);
      return () => {
        changeListeners.delete(listener);
      };
    },
    status,
    onStatus(listener) {
      statusListeners.add(listener);
      return () => {
        statusListeners.delete(listener);
      };
    },
  };
}
