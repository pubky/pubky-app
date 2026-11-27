import { timerSchedule } from './concurrency';
import { createCrawler } from './crawler';
import { type BackfillResult, DEFAULT_CRAWLER_OPTIONS, type LeafRequest, type StoreChange } from './crawler.types';
import { MAX_CURSOR } from './cursor';
import { IndexerAbortedError, IndexerError, IndexerNotStartedError } from './indexer.errors';
import {
  type Coordination,
  type CoordinationMessage,
  type CrawlRequest,
  DEFAULT_RUNTIME_OPTIONS,
  type IndexerRuntime,
  type RuntimeParams,
  type RuntimeStatus,
  type SavedIndexStatus,
} from './runtime.types';
import { createSavedIndex, type SavedIndex, writerIdOf } from './savedIndex';
import { scopeId } from './store.helpers';
import type { ScopeKey } from './store.types';

const LOCK_PREFIX = 'pubky-indexer:';

const asError = (error: unknown): Error => (error instanceof Error ? error : new Error(String(error)));

const byId = (...lists: ReadonlyArray<readonly ScopeKey[]>): ScopeKey[] => [
  ...new Map(lists.flat().map((scope): [string, ScopeKey] => [scopeId(scope), scope])).values(),
];

/** Both changes in one, each scope and seed once. */
function mergeChanges(a: StoreChange, b: StoreChange): StoreChange {
  const merged: StoreChange = { scopes: byId(a.scopes, b.scopes), seeds: [...new Set([...a.seeds, ...b.seeds])] };
  const forgotten = byId(a.forgotten ?? [], b.forgotten ?? []);
  return forgotten.length === 0 ? merged : { ...merged, forgotten };
}

const userKey = (user: string) => JSON.stringify(['user', user]);
/** The meta key of the seed's last scope sync, which the next session starts from. */
const syncedKey = (seed: string) => `syncedAt:${seed}`;
const leafKey = (author: string, group: string) => JSON.stringify(['leaf', author, group]);
const backfillKey = (author: string, group: string) => JSON.stringify(['backfill', author, group]);

/** Whether stored records lack files, and the homeservers that keep the missing ones from a fill. */
interface Bodies {
  pending: boolean;
  failing: readonly string[];
}

const NO_BODIES: Bodies = Object.freeze({ pending: false, failing: Object.freeze([]) });

const sameBodies = (a: Bodies, b: Bodies) =>
  a.pending === b.pending && a.failing.length === b.failing.length && a.failing.every((hs, i) => b.failing[i] === hs);

/** What a crawl settles with: a backfill its step, any other crawl nothing. */
type Settled = BackfillResult | undefined;

/** Stands in for the step of a crawling tab that settled a backfill without one. */
const NO_STEP: BackfillResult = Object.freeze({ tail: null, pages: 0, events: 0 });

const done = (settled: Promise<Settled>): Promise<void> => settled.then(() => undefined);

/** What the request queue runs: a scope sync runs beside it, not in it. */
type QueuedRequest = Exclude<CrawlRequest, { kind: 'scope' }>;

interface Task<R extends CrawlRequest = CrawlRequest> {
  request: R;
  resolve: (settled?: Settled) => void;
  reject: (error: unknown) => void;
  /** Asked by another tab, which asks the next crawling tab again if this one steps down. */
  remote: boolean;
}

interface Ensured<T> {
  promise: Promise<T>;
  settledAt: number | null;
}

export function createIndexerRuntime<D>(params: RuntimeParams<D>): IndexerRuntime {
  const { store, domain, now } = params;
  const schedule = params.schedule ?? timerSchedule;
  const coordination = params.coordination ?? null;
  const options = { ...DEFAULT_RUNTIME_OPTIONS, ...params.options };
  const inner = params.transport;
  const crawler = createCrawler({ transport: inner, store, domain, now, schedule, options: options.crawler });
  const crawlerOptions = { ...DEFAULT_CRAWLER_OPTIONS, ...options.crawler };
  const tab = Math.random().toString(36).slice(2);

  let seed: string | null = null;
  let started = false;
  /** The coordination this run uses: none in visitor mode, which crawls on demand in every tab. */
  let shared: Coordination | null = null;
  let paused = false;
  /** Whether this runtime may crawl: always while running alone, only while holding the lock otherwise. */
  let leading = false;
  let controller = new AbortController();
  /** The request running, or the saved index being read; one at a time. */
  let running: Promise<void> | null = null;
  /** The scope sync running beside the requests, its requests behind theirs at every homeserver. */
  let scoping: Promise<void> | null = null;
  /** Whether the running work reads the saved index, which a scope sync and a fill wait for. */
  let loading = false;
  /** The packs a load left to fetch beside the crawls, which a save waits for. */
  let packing: Promise<void> | null = null;
  /** The fill running beside the crawls, and what stops it. */
  let filling: Promise<void> | null = null;
  let stopFill: AbortController | null = null;
  /** What the crawling tab said of the files it lacks, for a tab that does not crawl. */
  let heardBodies: Bodies = NO_BODIES;
  /** What this tab last told the others of the files it lacks, `null` before it told them anything. */
  let toldBodies: Bodies | null = null;
  /** The homeservers the last fill could not reach while files of theirs were missing. */
  let fillFailing: string[] = [];
  /** Requests for one user, leaf or backfill, in arrival order. */
  let queue: Task<QueuedRequest>[] = [];
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
  let firstSyncPending = false;
  let asOf: number | null = null;
  /** The saved index is read before the first crawl after a start. */
  let loadDue = false;
  /** A saved index that could not be read is read again after the next scope sync. */
  let loadAgain = false;
  /** Stored records may miss their file: left by a session that closed before fetching it, or read from saved files. */
  let scanDue = false;
  /** A crawl left records without the file they need. */
  let fillDue = false;
  /** Whether this tab committed anything since its last save. */
  let dirty = false;
  let lastSaveAt: number | null = null;
  let saving: Promise<void> | null = null;
  /** The saved index of the current seed, made on first use; `null` for a store that keeps no meta values. */
  let savedIndex: Promise<SavedIndex | null> | null = null;
  let saved: SavedIndexStatus = { loadedFiles: 0, ignoredFiles: 0, lastSavedAt: null, error: null };
  let nextId = 0;
  const waitingFor = new Set<string>();
  /** This tab's requests sent to the crawling tab, by id. */
  const forwarded = new Map<string, Task>();
  /**
   * The `ensureUser` and `ensureLeaf` calls by key, and the backfills by author and group. Each lives while it runs
   * and for as long after it settles as a call reads it: `ensureTtlMs`, and `backfillMinIntervalMs` for a backfill.
   */
  const ensured = new Map<string, Ensured<void>>();
  const backfills = new Map<string, Ensured<BackfillResult>>();
  const changeListeners = new Set<(change: StoreChange) => void>();
  const statusListeners = new Set<(status: RuntimeStatus) => void>();

  const canCrawl = () => started && !paused && leading;

  /** A fill runs or is due. */
  const fillAhead = () => filling !== null || scanDue || fillDue;

  /**
   * What this tab knows its stored records lack: a file a fill runs or is due for, or one still missing after a fill,
   * on the homeservers that fill could not reach.
   */
  const ownBodies = (): Bodies => {
    const missing = crawler.unfilled() > 0;
    return { pending: fillAhead() || missing, failing: missing ? [...fillFailing] : [] };
  };

  const bodies = (): Bodies => (!started ? NO_BODIES : shared === null || leading ? ownBodies() : heardBodies);

  const status = (): RuntimeStatus => {
    const { pending, failing } = bodies();
    return {
      state: !started
        ? 'stopped'
        : running !== null || scoping !== null || filling !== null || (canCrawl() && fillAhead())
          ? 'syncing'
          : lastError !== null
            ? 'error'
            : 'idle',
      seed,
      lastSyncAt,
      lastError,
      stats: crawler.stats(),
      firstSyncPending,
      bodiesPending: pending,
      bodiesFailing: [...failing],
      asOf,
      ...(options.savedIndex ? { savedIndex: { ...saved } } : {}),
    };
  };
  const emitStatus = () => {
    const snapshot = status();
    const told: Bodies = { pending: snapshot.bodiesPending, failing: snapshot.bodiesFailing };
    if (shared !== null && leading && seed !== null && (toldBodies === null || !sameBodies(toldBodies, told))) {
      toldBodies = told;
      shared.post({ type: 'bodies', seed, pending: told.pending, failing: [...told.failing] });
    }
    for (const listener of statusListeners) listener(snapshot);
  };
  crawler.subscribe(emitStatus);

  function flushChange() {
    cancelFlush = null;
    const change = pendingChange;
    pendingChange = null;
    if (change !== null) for (const listener of changeListeners) listener(change);
  }

  /** Reports the changes now, so that a status saying a fill ended follows every change it made. */
  function flushNow() {
    cancelFlush?.();
    flushChange();
  }

  function noteChange(change: StoreChange) {
    // A forgotten scope loads again on the next ensure, in whichever tab forgot it.
    for (const { author, group } of change.forgotten ?? []) {
      ensured.delete(domain.groups.some(({ id }) => id === group) ? userKey(author) : leafKey(author, group));
    }
    pendingChange = pendingChange === null ? change : mergeChanges(pendingChange, change);
    if (cancelFlush === null) cancelFlush = schedule(flushChange, options.changeDebounceMs);
  }

  function announce(change: StoreChange) {
    noteChange(change);
    shared?.post({ type: 'changed', change });
  }

  function noteAsOf(at: number) {
    asOf = asOf === null ? at : Math.max(asOf, at);
  }

  crawler.onCommit((change) => {
    dirty = true;
    announce(change);
    // A crawl left files to fetch: the fill starts now, beside it, rather than when it ends.
    if (filling === null && crawler.unfilled() > 0) {
      fillDue = true;
      if (canCrawl() && startFill()) emitStatus();
    }
  });

  function savedIndexOf(current: string): Promise<SavedIndex | null> {
    savedIndex ??= writerIdOf(store).then((writer) =>
      writer === null
        ? null
        : createSavedIndex({
            // Requests to the user's homeserver like any other: queued with the crawl's, retried, paced after a 429.
            files: crawler.indexFilesOf(current, inner.indexFiles, options.indexFileTimeoutMs),
            store,
            domain,
            seed: current,
            writer,
            now,
            hops: crawlerOptions.hops,
            windowDays: crawlerOptions.windowDays,
            budget: options.fileBudgetBytes,
            expiryMs: options.writerExpiryMs,
            sealer: options.sealer,
          }),
    );
    return savedIndex;
  }

  /** Never rejects: a failure goes to the status. */
  async function loadIndex(current: string): Promise<void> {
    try {
      const index = await savedIndexOf(current);
      if (index === null) return;
      // The first sync waits for `hot` and the deltas only: the packs arrive beside it, each reported as it lands.
      const outcome = await index.load(announce);
      saved = { ...saved, loadedFiles: outcome.loaded, ignoredFiles: outcome.ignored, error: null };
      if (outcome.writtenAt !== null) noteAsOf(outcome.writtenAt);
      if (outcome.loaded > 0) {
        dirty = true;
        scanDue = true;
      }
      packing = loadPacks(index).finally(() => {
        packing = null;
      });
    } catch (error) {
      saved = { ...saved, error: asError(error) };
      loadAgain = true;
    }
  }

  /** Never rejects: a failure goes to the status, and the folder is read again after the next scope sync. */
  async function loadPacks(index: SavedIndex): Promise<void> {
    try {
      const outcome = await index.loadPacks(announce);
      const { loadedFiles, ignoredFiles } = saved;
      saved = { ...saved, loadedFiles: loadedFiles + outcome.loaded, ignoredFiles: ignoredFiles + outcome.ignored };
      if (outcome.writtenAt !== null) noteAsOf(outcome.writtenAt);
      if (outcome.loaded > 0) {
        dirty = true;
        scanDue = true;
      }
    } catch (error) {
      saved = { ...saved, error: asError(error) };
      loadAgain = true;
    }
    pump();
    emitStatus();
  }

  /**
   * Writes this tab's changes after `after` settles, when anything changed since the last save and, unless `force`,
   * the last save is old enough. Only right after a scope sync, whose members are whole, may it fold. Never rejects,
   * and never waits for a save already running.
   */
  function save(force: boolean, after: Promise<void> | null = null, mayFold = false): void {
    const current = seed;
    if (!options.savedIndex || current === null || saving !== null) return;
    if (!force && lastSaveAt !== null && now() - lastSaveAt < options.saveMinIntervalMs) return;
    saving = (after ?? Promise.resolve())
      // A save reads and writes what the writer knows of the folder, which the packs still landing change.
      .then(() => packing)
      .then(async () => {
        if (!dirty) return;
        dirty = false;
        try {
          await (await savedIndexOf(current))?.flush(mayFold);
          lastSaveAt = now();
          saved = { ...saved, lastSavedAt: lastSaveAt, error: null };
        } catch (error) {
          dirty = true;
          saved = { ...saved, error: asError(error) };
        }
      })
      .then(() => {
        saving = null;
        emitStatus();
      });
  }

  function scheduleSync(delay: number) {
    cancelTimer?.();
    cancelTimer = null;
    if (!canCrawl() || seed === null) return;
    cancelTimer = schedule(() => {
      cancelTimer = null;
      periodicDue = true;
      pump();
    }, delay);
  }

  async function crawl(request: QueuedRequest, signal: AbortSignal): Promise<Settled> {
    switch (request.kind) {
      case 'users':
        await crawler.syncUsers(request.users, signal);
        return;
      case 'leaf':
        await crawler.syncLeaf(request.leaf, signal);
        return;
      case 'backfill':
        return crawler.backfill(request.author, request.group, request.pages, signal);
    }
  }

  /** Never rejects: the outcome goes to the task, and a failure to the status. */
  async function execute(task: Task<QueuedRequest>, signal: AbortSignal): Promise<void> {
    try {
      task.resolve(await crawl(task.request, signal));
    } catch (error) {
      if (!signal.aborted) lastError = asError(error);
      task.reject(error);
    }
  }

  /** Runs leaf requests together as one crawl, each settled with its own outcome. Never rejects. */
  async function executeLeaves(tasks: Task<QueuedRequest>[], signal: AbortSignal): Promise<void> {
    const leaves = tasks.flatMap(({ request }) => (request.kind === 'leaf' ? [request.leaf] : []));
    try {
      const { refused } = await crawler.syncLeaves(leaves, signal);
      tasks.forEach((task, i) => {
        const error = refused[i];
        if (error === null) task.resolve();
        else task.reject(error);
      });
    } catch (error) {
      if (!signal.aborted) lastError = asError(error);
      for (const task of tasks) task.reject(error);
    }
  }

  /** The queued leaf requests after `first`, taken out of the queue to run with it. */
  function takeLeaves(first: Task<QueuedRequest>): Task<QueuedRequest>[] {
    const leaves = [first, ...queue.filter(({ request }) => request.kind === 'leaf')];
    queue = queue.filter(({ request }) => request.kind !== 'leaf');
    return leaves;
  }

  function enqueue(task: Task) {
    const { request } = task;
    if (request.kind === 'scope') scopeDue.push(task);
    else queue.push({ ...task, request });
  }

  /** Never rejects. A stopped sync settles its waiters with the abort; what it committed stays valid. */
  async function syncScope(current: string): Promise<void> {
    periodicDue = false;
    const waiters = scopeDue;
    scopeDue = [];
    const { signal } = controller;
    try {
      await crawler.syncScope(current, signal);
    } catch (error) {
      if (!signal.aborted) {
        lastError = asError(error);
        firstSyncPending = false;
      }
      for (const task of waiters) task.reject(error);
      // A failed sync keeps the interval too.
      scheduleSync(options.syncIntervalMs);
      return;
    } finally {
      // Its storage may answer by now, such as an account's once its session is restored.
      loadDue = loadDue || loadAgain;
      loadAgain = false;
    }
    lastSyncAt = now();
    lastError = null;
    firstSyncPending = false;
    noteAsOf(lastSyncAt);
    shared?.post({ type: 'synced', seed: current, at: lastSyncAt, bodiesPending: ownBodies().pending });
    // Best effort: without it the next session knows no time until its own first sync.
    void store.writeMeta?.(syncedKey(current), String(lastSyncAt)).catch(() => undefined);
    for (const task of waiters) task.resolve();
    scheduleSync(options.syncIntervalMs);
    save(false, null, true);
  }

  /**
   * Starts fetching the files that crawls left to fetch, and with a scan due those any stored record lacks, once the
   * saved index is read: as soon as a crawl commits a record whose file comes later, beside that crawl and the ones
   * that follow. Its requests queue with a scope sync's, behind a request someone waits for, and it commits each file
   * as it arrives, so it never aborts a request, and only a stop or a step down aborts it. Whether it started.
   */
  function startFill(): boolean {
    if (filling !== null || loading || loadDue || !(scanDue || fillDue)) return false;
    const scan = scanDue;
    scanDue = false;
    fillDue = false;
    const stopper = new AbortController();
    stopFill = stopper;
    /** Whether it committed a file. */
    const run = async (): Promise<boolean> => {
      try {
        const { fetched, failedHomeservers } = await crawler.hydrate(
          scan ? await store.listScopes() : [],
          stopper.signal,
        );
        fillFailing = failedHomeservers;
        return fetched > 0;
      } catch (error) {
        if (!stopper.signal.aborted) {
          lastError = asError(error);
          return true;
        }
        // Due again for whichever run crawls next.
        scanDue = scanDue || scan;
        fillDue = true;
        return true;
      }
    };
    filling = run().then((committed) => {
      filling = null;
      stopFill = null;
      // Files a crawl left while the fill ended are fetched next; a fill that brought none waits for a crawl instead.
      if (committed && crawler.unfilled() > 0) fillDue = true;
      // A view rebuilt on the status that says the fill ended then holds every file it brought.
      if (committed) flushNow();
      pump();
      emitStatus();
    });
    return true;
  }

  /** What runs now, settled once all of it is; `null` when nothing does. */
  function busy(): Promise<void> | null {
    const work = [running, scoping, filling, saving].filter((item): item is Promise<void> => item !== null);
    return work.length === 0 ? null : Promise.all(work).then(() => undefined);
  }

  /** Starts what comes after a crawl before telling anyone it ended, so no status falls between the two. */
  function afterCrawl(): void {
    // A fill that could not finish waits for the next crawl, never looping over a failing homeserver.
    if (crawler.unfilled() > 0) fillDue = true;
    pump();
    emitStatus();
  }

  /** The next request, after a start the saved index first; `null` when none waits. */
  function nextRequest(current: string | null): Promise<void> | null {
    if (loadDue && current !== null) {
      loadDue = false;
      loading = true;
      return loadIndex(current);
    }
    const task = queue.shift();
    if (task === undefined) return null;
    // Leaves are small and independent: the ones waiting run together, so a page's post and profiles load at once.
    if (task.request.kind === 'leaf') return executeLeaves(takeLeaves(task), controller.signal);
    return execute(task, controller.signal);
  }

  /**
   * Starts the next request, one at a time, and the scope sync beside it once the saved index is read: at every
   * homeserver the request's calls go first, so neither waits for the other to end and nothing is aborted. With no
   * crawl running, a fill.
   */
  function pump() {
    const current = seed;
    if (!canCrawl()) return;
    let began = false;
    if (running === null) {
      const work = nextRequest(current);
      if (work !== null) {
        began = true;
        running = work.then(() => {
          running = null;
          loading = false;
          afterCrawl();
        });
      }
    }
    if (scoping === null && !loading && !loadDue && current !== null && (periodicDue || scopeDue.length > 0)) {
      began = true;
      scoping = syncScope(current).then(() => {
        scoping = null;
        afterCrawl();
      });
    }
    if (startFill()) began = true;
    if (began) emitStatus();
  }

  function forward(task: Task) {
    if (shared === null || seed === null) return;
    const id = `${tab}:${nextId}`;
    nextId += 1;
    forwarded.set(id, task);
    shared.post({ type: 'request', seed, id, request: task.request });
  }

  function remoteTask(id: string, request: CrawlRequest): Task {
    return {
      request,
      resolve: (settled) =>
        shared?.post({ type: 'settled', id, error: null, ...(settled === undefined ? {} : { backfill: settled }) }),
      // An abort means this tab stopped; the asking tab asks the next crawling tab instead.
      reject: (error) => {
        if (!(error instanceof IndexerAbortedError)) {
          shared?.post({ type: 'settled', id, error: asError(error).message });
        }
      },
      remote: true,
    };
  }

  function lead() {
    leading = true;
    toldBodies = null;
    if (shared !== null && seed !== null) {
      shared.post({ type: 'leader', seed });
      for (const task of forwarded.values()) enqueue(task);
      forwarded.clear();
    }
    const since = lastSyncAt === null ? Infinity : now() - lastSyncAt;
    if (seed === null) periodicDue = false;
    else if (since >= options.syncIntervalMs) periodicDue = true;
    else scheduleSync(options.syncIntervalMs - since);
    pump();
    emitStatus();
  }

  function seekLead() {
    const current = seed;
    if (!started || paused || leading) return;
    if (shared === null || current === null) {
      lead();
      return;
    }
    const name = `${LOCK_PREFIX}${current}`;
    if (waitingFor.has(name)) return;
    waitingFor.add(name);
    shared
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
    if (shared !== null && started) {
      for (const task of [...queue, ...scopeDue]) forward(task);
      queue = [];
      scopeDue = [];
    }
    // Only the crawling tab fetches; the next one fills what this one left, and says so.
    heardBodies = ownBodies();
    stopFill?.abort();
    const release = releaseLock;
    releaseLock = null;
    if (release === null) return;
    const settled = busy();
    if (settled === null) release();
    else void settled.then(release);
  }

  function onMessage(message: CoordinationMessage) {
    if (!started || seed === null) return;
    switch (message.type) {
      case 'changed':
        noteChange(message.change);
        return;
      case 'leader':
        if (message.seed !== seed) return;
        for (const [id, task] of forwarded) shared?.post({ type: 'request', seed, id, request: task.request });
        return;
      case 'request':
        if (!leading || message.seed !== seed) return;
        enqueue(remoteTask(message.id, message.request));
        pump();
        return;
      case 'synced':
        if (message.seed !== seed) return;
        firstSyncPending = false;
        heardBodies = { ...heardBodies, pending: message.bodiesPending };
        noteAsOf(message.at);
        emitStatus();
        return;
      case 'bodies':
        if (message.seed !== seed) return;
        heardBodies = { pending: message.pending, failing: [...message.failing] };
        flushNow();
        emitStatus();
        return;
      case 'settled': {
        const task = forwarded.get(message.id);
        if (task === undefined) return;
        forwarded.delete(message.id);
        if (message.error === null) task.resolve(message.backfill);
        else task.reject(new IndexerError(message.error));
        return;
      }
    }
  }

  function submit(request: CrawlRequest): Promise<Settled> {
    if (!started) return Promise.reject(new IndexerNotStartedError());
    return new Promise<Settled>((resolve, reject) => {
      const task: Task = { request, resolve, reject, remote: false };
      if (shared === null || leading) {
        enqueue(task);
        // A leaf waits one microtask, so the leaves asked in the same turn run as one batch.
        if (request.kind === 'leaf') queueMicrotask(pump);
        else pump();
      } else {
        forward(task);
      }
    });
  }

  /** Drops the entries that settled `keepMs` ago or longer, which no call reads again. */
  function release<T>(entries: Map<string, Ensured<T>>, keepMs: number): void {
    for (const [key, entry] of entries) {
      if (entry.settledAt !== null && now() - entry.settledAt >= keepMs) entries.delete(key);
    }
  }

  /** Shares the call with a pending one of the same key, or one finished less than `ttlMs` ago. */
  function ensure<T>(
    entries: Map<string, Ensured<T>>,
    key: string,
    ttlMs: number,
    start: () => Promise<T>,
  ): Promise<T> {
    const known = entries.get(key);
    if (known !== undefined && (known.settledAt === null || now() - known.settledAt < ttlMs)) return known.promise;
    const promise = start();
    const entry: Ensured<T> = { promise, settledAt: null };
    entries.set(key, entry);
    promise.then(
      () => {
        entry.settledAt = now();
      },
      () => {
        if (entries.get(key) === entry) entries.delete(key);
      },
    );
    return promise;
  }

  /** Never rejects: a store without meta, or a value it cannot read, leaves the time unknown. */
  function readStoredAsOf(current: string): void {
    const run = controller;
    void store
      .readMeta?.(syncedKey(current))
      .then((value) => {
        if (controller !== run || value === null || !/^\d+$/.test(value)) return;
        noteAsOf(Number(value));
        emitStatus();
      })
      .catch(() => undefined);
  }

  async function forget(target: { users?: readonly string[]; leaves?: readonly LeafRequest[] }): Promise<void> {
    const users = target.users ?? [];
    const leaves = target.leaves ?? [];
    for (const user of users) ensured.delete(userKey(user));
    for (const { author, group } of leaves) ensured.delete(leafKey(author, group));
    const members = seed === null ? new Map<string, number>() : await store.readScopeMembers(seed);
    const homeserverOf = async (user: string) => (await store.readUserHomeserver(user))?.homeserver ?? null;
    const scopes: ScopeKey[] = [];
    for (const user of users) {
      const homeserver = await homeserverOf(user);
      if (homeserver === null || user === seed || members.has(user)) continue;
      for (const { id } of domain.groups) scopes.push({ author: user, homeserver, group: id });
    }
    for (const { author, group } of leaves) {
      const homeserver = await homeserverOf(author);
      if (homeserver !== null) scopes.push({ author, homeserver, group });
    }
    if (scopes.length === 0) return;
    // Every cursor is at or below the largest one, so the eviction drops each scope whole.
    await store.commit({ evictions: scopes.map((scope) => ({ scope, cutoff: MAX_CURSOR })) });
    crawler.forgetUnfilled(scopes);
    announce({ scopes, seeds: [], forgotten: scopes });
  }

  function stop() {
    if (!started) return;
    started = false;
    controller.abort();
    stopFill?.abort();
    stepDown();
    unsubscribe?.();
    unsubscribe = null;
    shared = null;
    const aborted = new IndexerAbortedError();
    for (const task of [...queue, ...scopeDue]) task.reject(aborted);
    for (const task of forwarded.values()) task.reject(aborted);
    queue = [];
    scopeDue = [];
    forwarded.clear();
    ensured.clear();
    backfills.clear();
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
      firstSyncPending = next !== null;
      asOf = null;
      heardBodies = NO_BODIES;
      fillFailing = [];
      loadDue = options.savedIndex && next !== null;
      loadAgain = false;
      scanDue = true;
      fillDue = false;
      dirty = false;
      lastSaveAt = null;
      savedIndex = null;
      saved = { loadedFiles: 0, ignoredFiles: 0, lastSavedAt: null, error: null };
      shared = next === null ? null : coordination;
      if (shared !== null) unsubscribe = shared.subscribe(onMessage);
      if (next !== null) readStoredAsOf(next);
      seekLead();
      emitStatus();
    },
    stop,
    pause() {
      if (paused) return;
      paused = true;
      if (leading) save(true, busy());
      stepDown();
      emitStatus();
    },
    resume() {
      if (!paused) return;
      paused = false;
      seekLead();
      emitStatus();
    },
    refresh(users) {
      if (users !== undefined) return done(submit({ kind: 'users', users: [...users] }));
      // Visitor mode has no scope to sync.
      return started && seed === null ? Promise.resolve() : done(submit({ kind: 'scope' }));
    },
    ensureUser(user) {
      release(ensured, options.ensureTtlMs);
      return ensure(ensured, userKey(user), options.ensureTtlMs, () => done(submit({ kind: 'users', users: [user] })));
    },
    ensureLeaf(leaf) {
      release(ensured, options.ensureTtlMs);
      return ensure(ensured, leafKey(leaf.author, leaf.group), options.ensureTtlMs, () =>
        done(submit({ kind: 'leaf', leaf: { author: leaf.author, group: leaf.group, paths: [...leaf.paths] } })),
      );
    },
    backfill(author, group, pages, backfillOptions) {
      release(backfills, options.backfillMinIntervalMs);
      const key = backfillKey(author, group);
      const known = backfills.get(key);
      const force = backfillOptions?.force === true;
      const recent =
        known !== undefined && known.settledAt !== null && now() - known.settledAt < options.backfillMinIntervalMs;
      if (!force && recent) return Promise.resolve(null);
      // A step still running is shared, forced or not; a finished one is never reused.
      return ensure(backfills, key, 0, () =>
        submit({ kind: 'backfill', author, group, pages }).then((step) => step ?? NO_STEP),
      );
    },
    forget,
    setExcluded: (users) => crawler.setExcluded(users),
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
