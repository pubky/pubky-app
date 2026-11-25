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
/** A scope sync pre-empted this many times in a row runs its next pass to the end, ahead of queued requests. */
const MAX_PREEMPTIONS = 3;

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
  /** Aborts the running scope sync so that a request goes first; `null` while none runs or it may not yield. */
  let preempt: AbortController | null = null;
  /** Scope syncs pre-empted since one last ran to its end. */
  let preempted = 0;
  /** Requests for one user, leaf or backfill, in arrival order. */
  let queue: Task[] = [];
  /** Requests for a whole scope sync: the next one to start settles them all. */
  let scopeDue: Task[] = [];
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
      task.resolve();
    } catch (error) {
      if (!signal.aborted) lastError = asError(error);
      task.reject(error);
    }
  }

  function enqueue(task: Task) {
    if (task.request.kind === 'scope') scopeDue.push(task);
    else queue.push(task);
  }

  /** Puts the waiters of a pre-empted sync back first; a tab that stopped crawling hands its own on instead. */
  function requeue(waiters: Task[]) {
    if (coordination === null || leading) {
      scopeDue = [...waiters, ...scopeDue];
      return;
    }
    for (const task of waiters) if (!task.remote) forward(task);
  }

  /**
   * Never rejects. A pre-empted sync settles nothing: what it committed stays valid, and the next pass continues
   * from the stored coverage, so it refetches only each batch's newest events.
   */
  async function syncScope(waiters: Task[], current: string, signal: AbortSignal, outer: AbortSignal) {
    try {
      await crawler.syncScope(current, signal);
    } catch (error) {
      if (signal.aborted && !outer.aborted) {
        preempted += 1;
        periodicDue = true;
        requeue(waiters);
        return;
      }
      if (!signal.aborted) lastError = asError(error);
      preempted = 0;
      for (const task of waiters) task.reject(error);
      // A failed sync keeps the interval too.
      scheduleSync(options.syncIntervalMs);
      return;
    }
    lastSyncAt = now();
    lastError = null;
    preempted = 0;
    for (const task of waiters) task.resolve();
    scheduleSync(options.syncIntervalMs);
  }

  function startScopeSync(current: string): Promise<void> {
    periodicDue = false;
    const waiters = scopeDue;
    scopeDue = [];
    const outer = controller.signal;
    preempt = preempted < MAX_PREEMPTIONS ? new AbortController() : null;
    return syncScope(waiters, current, preempt?.signal ?? outer, outer);
  }

  /**
   * Starts the next crawl: requests first, then a scope sync, unless the scope sync was pre-empted too often. A
   * request arriving during a scope sync that may yield aborts it at its next safe point.
   */
  function pump() {
    const current = seed;
    if (current === null || !canCrawl()) return;
    if (running !== null) {
      if (queue.length > 0) preempt?.abort();
      return;
    }
    const scopeWanted = periodicDue || scopeDue.length > 0;
    const task = scopeWanted && preempted >= MAX_PREEMPTIONS ? undefined : queue.shift();
    let work: Promise<void>;
    if (task !== undefined) work = execute(task, current, controller.signal);
    else if (scopeWanted) work = startScopeSync(current);
    else return;
    running = work.then(() => {
      running = null;
      preempt = null;
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
      for (const task of forwarded.values()) enqueue(task);
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
    scopeDue = scopeDue.filter((task) => !task.remote);
    if (coordination !== null && started) {
      for (const task of [...queue, ...scopeDue]) forward(task);
      queue = [];
      scopeDue = [];
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
        enqueue(remoteTask(message.id, message.request));
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
        enqueue(task);
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
    preempt?.abort();
    stepDown();
    unsubscribe?.();
    unsubscribe = null;
    const aborted = new IndexerAbortedError();
    for (const task of [...queue, ...scopeDue]) task.reject(aborted);
    for (const task of forwarded.values()) task.reject(aborted);
    queue = [];
    scopeDue = [];
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
      preempted = 0;
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
