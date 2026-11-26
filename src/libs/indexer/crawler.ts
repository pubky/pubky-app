import {
  chunks,
  createRequestGate,
  mapLimit,
  type Priority,
  sleep,
  throwIfAborted,
  timerSchedule,
  untilAborted,
  withDeadline,
} from './concurrency';
import {
  type Crawler,
  type CrawlerParams,
  type CrawlerStats,
  DEFAULT_CRAWLER_OPTIONS,
  type HydrateResult,
  type LeafRequest,
  type LeavesOutcome,
  type StoreChange,
  type SyncOutcome,
  type SyncResult,
} from './crawler.types';
import { CURSOR_ZERO } from './cursor';
import type { PathGroup } from './domain.types';
import { createHeap, type Heap } from './heap';
import {
  HomeserverUnreachableError,
  IndexerAbortedError,
  IndexerError,
  InvalidIndexInputError,
  RateLimitedError,
  RequestTimeoutError,
} from './indexer.errors';
import type { Coverage, Cursor, Entry, RecordEntry, Run } from './indexer.types';
import { readForward, type ReadPage } from './paging';
import { foldEvents } from './run';
import { scopeId, scopeOf } from './store.helpers';
import type { HighWater, ReadAt, ScopeKey, StoreBatch } from './store.types';
import { buildTimeTable, cursorAt, estimateMs, type TimeSample } from './timeTable';
import type { AuthoredStreamEvent } from './transport.types';

const DAY_MS = 24 * 60 * 60 * 1000;
const BACKOFF_BASE_MS = 60 * 1000;
const BACKOFF_MAX_MS = 30 * 60 * 1000;
/** Waits before a retry the homeserver names none for: doubling per consecutive failure of it, up to the max. */
const RETRY_FIRST_WAIT_MS = 1000;
const RETRY_MAX_WAIT_MS = 8 * 1000;
const RETRIES = 3;
const MICROS_PER_MS = BigInt(1000);
const ONE = BigInt(1);

/** What one operation learned about homeservers, so each is checked once per operation. */
interface OperationContext {
  signal?: AbortSignal;
  /** Where its requests queue at each homeserver. */
  priority: Priority;
  /** Each homeserver's restore check, shared by the reads of the operation that run together. */
  checked: Map<string, Promise<boolean>>;
  /** The epoch of each homeserver its reads are made under, stated by every commit of what they read. */
  epochs: Map<string, number>;
  /** The newest event read from each homeserver. */
  highWater: Map<string, HighWater>;
  /** Each homeserver's stored clock with every dated write read since, the clock its window reads go by. */
  clocks: Map<string, TimeSample[]>;
  /** The dated writes read from each homeserver that no commit has stored yet. */
  unsaved: Map<string, TimeSample[]>;
  /** Homeservers failed or backing off, skipped for the rest of the operation. */
  failed: Set<string>;
}

/**
 * Where a window read of a user starts and stops: below `top`, or at their newest event for `null`, down to the
 * cutoff, or to `floor`, their stored head, where the read joins what is stored. `held` is how many paths their top
 * range holds already, when the read continues below it.
 */
interface WindowBound {
  top: Cursor | null;
  floor: Cursor | null;
  held: number;
}

/** Users' events to commit newest first, each user's in their range `(tail, top]`. */
interface Below {
  ranges: ReadonlyMap<string, { top: Cursor; tail: Cursor }>;
  events: readonly AuthoredStreamEvent[];
}

/** A record stored without the file it needs, with the epoch of the read that stored it. */
interface Unfilled<D> {
  scope: ScopeKey;
  record: RecordEntry<D>;
  epoch: number;
}

const contextOf = (signal?: AbortSignal, priority: Priority = 'foreground'): OperationContext => ({
  signal,
  priority,
  checked: new Map(),
  epochs: new Map(),
  highWater: new Map(),
  clocks: new Map(),
  unsaved: new Map(),
  failed: new Set(),
});

type Counter = 'lookups' | 'streamRequests' | 'bodyRequests' | 'events';

const headOf = (coverage: Coverage): Cursor | null =>
  coverage.length === 0 ? null : coverage[coverage.length - 1].head;

const highestOf = (events: readonly AuthoredStreamEvent[]): Cursor =>
  events.reduce((high, event) => (event.cursor > high ? event.cursor : high), CURSOR_ZERO);

const lowestOf = (events: readonly AuthoredStreamEvent[]): Cursor | null =>
  events.reduce<Cursor | null>((low, event) => (low === null || event.cursor < low ? event.cursor : low), null);

/** The tail of the top contiguous range, the only trusted one. */
const topTailOf = (coverage: Coverage): Cursor | null =>
  coverage.length === 0 ? null : coverage[coverage.length - 1].tail;

/** A run changes what is served when it brings entries or does not extend the stored top range. */
const changesServed = (run: Run<unknown>, storedHead: Cursor | null): boolean =>
  run.entries.length > 0 || (storedHead !== null && run.tail !== storedHead);

const sameMembers = (a: ReadonlyMap<string, number>, b: ReadonlyMap<string, number>): boolean =>
  a.size === b.size && [...b].every(([user, hop]) => a.get(user) === hop);

/** What a commit of the operation's reads of the homeserver states: their epoch. */
const readAtOf = (ctx: OperationContext, homeserver: string): { readAt?: ReadAt[] } => {
  const epoch = ctx.epochs.get(homeserver);
  return epoch === undefined ? {} : { readAt: [{ homeserver, epoch }] };
};

/**
 * What a commit of runs read from the homeserver states: their epoch, the newest event read, the dated writes read
 * since the last such commit, a success.
 */
const readStateOf = (ctx: OperationContext, homeserver: string) => {
  const highWater = ctx.highWater.get(homeserver);
  const clock = ctx.unsaved.get(homeserver) ?? [];
  ctx.unsaved.delete(homeserver);
  return {
    ...readAtOf(ctx, homeserver),
    homeserverStates: [
      {
        homeserver,
        patch: {
          ...(highWater === undefined ? {} : { highWater }),
          ...(clock.length === 0 ? {} : { clock }),
          failure: null,
        },
      },
    ],
  };
};

export function createCrawler<D>(params: CrawlerParams<D>): Crawler {
  const { transport, store, domain, now } = params;
  const schedule = params.schedule ?? timerSchedule;
  const wait = params.sleep ?? ((ms: number, signal?: AbortSignal) => sleep(ms, signal, schedule));
  const options = { ...DEFAULT_CRAWLER_OPTIONS, ...params.options };
  const scopeGroup = domain.groups.find((group) => group.id === domain.scopeGroup);
  if (scopeGroup === undefined || scopeGroup.history !== 'full') {
    throw new InvalidIndexInputError(`scope group ${domain.scopeGroup} is not a group with full history`);
  }
  const scopeGroupId = scopeGroup.id;
  const fullGroups = domain.groups.filter((group) => group.history === 'full');
  const windowGroups = domain.groups.filter((group) => group.history === 'window');
  const allPaths = domain.groups.flatMap((group) => group.paths);

  /** Every request to a homeserver, of every operation, queues here, so the crawler and not the browser orders them. */
  const gate = createRequestGate(options.homeserverConcurrency);
  const counters = { usersPerHop: [] as number[], lookups: 0, streamRequests: 0, bodyRequests: 0, events: 0 };
  let seedReach: CrawlerStats['seed'];
  let excluded: ReadonlySet<string> = new Set(options.excluded);
  const seen = new Set<string>();
  const failed = new Set<string>();
  /** Lookups in flight by user, so operations running together resolve a user once. */
  const lookups = new Map<string, Promise<string | null>>();
  /** Consecutive failed requests per homeserver, 429s included, across operations, until one to it succeeds. */
  const failing = new Map<string, number>();
  /**
   * Records stored without the file they need, by scope id then path, each with the epoch of the read that stored it.
   * One lives from the commit that stored it until a fill tries it, a later event of its path replaces it, or its
   * homeserver or scope is dropped.
   */
  const unfilled = new Map<string, Map<string, Unfilled<D>>>();
  let unfilledCount = 0;
  /** The fills running, each told of every record a commit leaves without its file. */
  const fills = new Set<(item: Unfilled<D>) => void>();
  /** Keeps the newest event of each path: a record without data to fetch, or nothing once data or a delete won. */
  const noteEntry = (scope: ScopeKey, entry: Entry<D>, epoch: number, fetch: boolean) => {
    const id = scopeId(scope);
    const paths = unfilled.get(id) ?? new Map<string, Unfilled<D>>();
    const known = paths.get(entry.path);
    if (known !== undefined && known.record.cursor >= entry.cursor) return;
    if (known !== undefined) unfilledCount -= 1;
    paths.delete(entry.path);
    if (fetch && entry.kind === 'record' && entry.data === undefined) {
      const item = { scope: scopeOf(scope), record: entry, epoch };
      paths.set(entry.path, item);
      unfilledCount += 1;
      for (const fill of fills) fill(item);
    }
    if (paths.size === 0) unfilled.delete(id);
    else unfilled.set(id, paths);
  };
  const isUnfilled = (item: Unfilled<D>) => unfilled.get(scopeId(item.scope))?.get(item.record.path) === item;
  const settleUnfilled = (item: Unfilled<D>) => {
    if (!isUnfilled(item)) return;
    const id = scopeId(item.scope);
    unfilled.get(id)?.delete(item.record.path);
    unfilledCount -= 1;
    if (unfilled.get(id)?.size === 0) unfilled.delete(id);
  };
  const dropUnfilled = (keep: (scope: ScopeKey) => boolean) => {
    for (const [id, paths] of unfilled) {
      const first = paths.values().next().value;
      if (first === undefined || keep(first.scope)) continue;
      unfilledCount -= paths.size;
      unfilled.delete(id);
    }
  };
  /** Per homeserver, the epoch and time of the last restore check a `backfill` made, which the next steps share. */
  const backfillChecks = new Map<string, { epoch: number; at: number }>();
  const listeners = new Set<(stats: CrawlerStats) => void>();
  const commitListeners = new Set<(change: StoreChange) => void>();

  const stats = (): CrawlerStats => ({
    usersPerHop: [...counters.usersPerHop],
    homeserversSeen: seen.size,
    homeserversFailed: failed.size,
    lookups: counters.lookups,
    streamRequests: counters.streamRequests,
    bodyRequests: counters.bodyRequests,
    events: counters.events,
    ...(seedReach === undefined ? {} : { seed: { ...seedReach } }),
  });
  const changed = () => {
    const snapshot = stats();
    for (const listener of listeners) listener(snapshot);
  };
  const count = (counter: Counter, by = 1) => {
    counters[counter] += by;
    changed();
  };
  const markFailed = (ctx: OperationContext, homeserver: string) => {
    ctx.failed.add(homeserver);
    failed.add(homeserver);
    changed();
  };

  async function commit(batch: StoreBatch<D>, change: StoreChange): Promise<void> {
    await store.commit(batch);
    if (change.scopes.length === 0 && change.seeds.length === 0) return;
    for (const listener of commitListeners) listener(change);
  }

  /**
   * Runs a request to the homeserver, retrying a 429 or a failure up to `RETRIES` times, after the wait a 429 named
   * or else one that grows with the homeserver's consecutive failures. So one slow or failed request costs a retry,
   * and only a request that keeps failing fails its homeserver.
   */
  async function attempt<T>(ctx: OperationContext, homeserver: string, request: () => Promise<T>): Promise<T> {
    for (let retry = 0; ; retry += 1) {
      throwIfAborted(ctx.signal);
      try {
        const result = await request();
        failing.delete(homeserver);
        return result;
      } catch (error) {
        throwIfAborted(ctx.signal);
        if (!(error instanceof RateLimitedError || error instanceof HomeserverUnreachableError)) throw error;
        const streak = failing.get(homeserver) ?? 0;
        failing.set(homeserver, streak + 1);
        if (retry >= RETRIES) throw error;
        const named = error instanceof RateLimitedError ? error.retryAfterMs : undefined;
        await wait(named ?? Math.min(RETRY_FIRST_WAIT_MS * 2 ** streak, RETRY_MAX_WAIT_MS), ctx.signal);
        // Another request of this operation gave up on the homeserver meanwhile: ask it nothing more.
        if (ctx.failed.has(homeserver)) throw error;
      }
    }
  }

  /**
   * One call to the homeserver once the gate lets it go, under the request deadline from then on; past it the
   * request fails as unreachable.
   */
  async function call<T>(ctx: OperationContext, homeserver: string, request: (signal: AbortSignal) => Promise<T>) {
    try {
      return await gate.run(
        homeserver,
        ctx.priority,
        () => withDeadline(request, options.requestTimeoutMs, schedule, ctx.signal),
        ctx.signal,
      );
    } catch (error) {
      if (error instanceof RequestTimeoutError) throw new HomeserverUnreachableError(homeserver, { cause: error });
      throw error;
    }
  }

  function reader(ctx: OperationContext, homeserver: string, paths: string[], limit: number): ReadPage {
    return async (users, reverse) => {
      const events = await attempt(ctx, homeserver, () => {
        count('streamRequests');
        return call(ctx, homeserver, (signal) =>
          transport.readEvents({ homeserver, users, paths, limit, reverse, signal }),
        );
      });
      count('events', events.length);
      const newest = events.reduce<AuthoredStreamEvent | null>(
        (high, event) => (high === null || event.cursor > high.cursor ? event : high),
        null,
      );
      const known = ctx.highWater.get(homeserver);
      if (newest !== null && (known === undefined || newest.cursor > known.cursor)) {
        ctx.highWater.set(homeserver, { cursor: newest.cursor, author: newest.author });
      }
      // Only a write dates its cursor: a delete of an old path can happen any time later.
      const dated = events.flatMap(({ type, path, cursor, author }): TimeSample[] => {
        const time = type === 'PUT' ? domain.timeOfPath(path) : null;
        return time === null ? [] : [{ cursor, ms: Number(time / MICROS_PER_MS), writer: author }];
      });
      for (const into of [ctx.clocks, ctx.unsaved]) {
        const known = into.get(homeserver);
        if (known === undefined) into.set(homeserver, [...dated]);
        else known.push(...dated);
      }
      return events;
    };
  }

  /** Runs `work` for one homeserver. A failure marks it failed for this operation instead of throwing. */
  async function guard(ctx: OperationContext, homeserver: string, work: () => Promise<void>): Promise<boolean> {
    try {
      await work();
      return true;
    } catch (error) {
      throwIfAborted(ctx.signal);
      if (error instanceof IndexerAbortedError) throw error;
      const unreachable = error instanceof HomeserverUnreachableError || error instanceof InvalidIndexInputError;
      if (!unreachable && !(error instanceof RateLimitedError)) throw error;
      // Reads of one operation that run together fail a homeserver once: one failure, one step of backoff.
      if (ctx.failed.has(homeserver)) return false;
      markFailed(ctx, homeserver);
      if (unreachable) {
        const { failure } = await store.readHomeserverState(homeserver);
        const failures = (failure?.failures ?? 0) + 1;
        const delay = Math.min(BACKOFF_BASE_MS * 2 ** (failures - 1), BACKOFF_MAX_MS);
        await store.patchHomeserverState(homeserver, { failure: { failures, retryAt: now() + delay } });
      }
      return false;
    }
  }

  /**
   * Re-reads the newest event of the author of the stored high-water mark. Only a homeserver that lost its
   * log, a restore or a rebuild, can answer with something older; then everything stored for it goes.
   */
  async function detectRestore(ctx: OperationContext, homeserver: string, highWater: HighWater | null) {
    if (highWater === null) return;
    const newest = await reader(ctx, homeserver, allPaths, 1)([{ user: highWater.author, cursor: null }], true);
    if (newest.length > 0 && newest[0].cursor >= highWater.cursor) return;
    const scopes = (await store.listScopes()).filter((scope) => scope.homeserver === homeserver);
    await commit({ ...readAtOf(ctx, homeserver), deleteHomeservers: [homeserver] }, { scopes, seeds: [] });
    dropUnfilled((scope) => scope.homeserver !== homeserver);
    // Read again: the deletion that started it may be another operation's, which found the restore first.
    ctx.epochs.set(homeserver, (await store.readHomeserverState(homeserver)).epoch);
    // The clock went with the log: the times of the old cursors say nothing about the new ones.
    ctx.clocks.set(homeserver, []);
    ctx.unsaved.delete(homeserver);
  }

  /** Whether the homeserver may be crawled now: not failed, not backing off, checked for a restore. */
  async function ready(ctx: OperationContext, homeserver: string): Promise<boolean> {
    if (ctx.failed.has(homeserver)) return false;
    const state = await store.readHomeserverState(homeserver);
    if (state.failure !== null && state.failure.retryAt > now()) {
      markFailed(ctx, homeserver);
      return false;
    }
    let check = ctx.checked.get(homeserver);
    if (check === undefined) {
      ctx.epochs.set(homeserver, state.epoch);
      ctx.clocks.set(homeserver, state.clock);
      check = guard(ctx, homeserver, () => detectRestore(ctx, homeserver, state.highWater));
      ctx.checked.set(homeserver, check);
    }
    return check;
  }

  /** The stored head of each user in the group, in batch order, `null` for a user with nothing stored. */
  async function storedHeads(homeserver: string, group: PathGroup, users: readonly string[]) {
    const heads = new Map<string, Cursor | null>();
    for (const user of users) {
      heads.set(user, headOf(await store.readCoverage({ author: user, homeserver, group: group.id })));
    }
    return heads;
  }

  async function bodyOf(
    ctx: OperationContext,
    homeserver: string,
    author: string,
    record: RecordEntry<D>,
  ): Promise<D | null> {
    const bytes = await attempt(ctx, homeserver, () => {
      count('bodyRequests');
      return call(ctx, homeserver, (signal) => transport.getPublic({ author, path: record.path, signal }));
    });
    // A 404 or other bytes mean a later event replaced this one, and that event brings the data.
    if (bytes === null) return null;
    if (record.hash !== undefined && domain.matchesHash !== undefined && !domain.matchesHash(bytes, record.hash)) {
      return null;
    }
    return domain.reduce(author, record.path, bytes);
  }

  /** Sets `data` on the records of fresh runs that need their file to render. */
  async function attachBodies(ctx: OperationContext, runs: readonly Run<D>[]): Promise<void> {
    const records = runs.flatMap((run) =>
      run.entries.flatMap((entry) =>
        entry.kind === 'record' && domain.needsBody(entry.path) === 'render'
          ? [{ homeserver: run.homeserver, author: run.author, record: entry }]
          : [],
      ),
    );
    await mapLimit(records, options.homeserverConcurrency, async ({ homeserver, author, record }) => {
      const data = await bodyOf(ctx, homeserver, author, record);
      if (data !== null) record.data = data;
    });
  }

  /** Commits fresh runs and leaves the files of their `later` records to the fill. */
  async function commitRuns(batch: StoreBatch<D>, change: StoreChange): Promise<void> {
    await commit(batch, change);
    for (const run of batch.applyRuns ?? []) {
      const epoch = batch.readAt?.find(({ homeserver }) => homeserver === run.homeserver)?.epoch ?? 0;
      for (const entry of run.entries) {
        const needs = domain.needsBody(entry.path);
        if (needs !== null) noteEntry(run, entry, epoch, needs === 'later');
      }
    }
  }

  /** Reads one batch forward from its tails and commits the run of each user that moved, with the new high water. */
  async function crawlBatch(
    ctx: OperationContext,
    homeserver: string,
    group: PathGroup,
    tails: ReadonlyMap<string, Cursor>,
    stored: ReadonlyMap<string, Cursor | null>,
  ) {
    const read = reader(ctx, homeserver, group.paths, options.pageLimit);
    const { heads, events } = await readForward(tails, options.pageLimit, read);
    const runs: Run<D>[] = [];
    for (const [author, tail] of tails) {
      const head = heads.get(author) ?? tail;
      if (head <= tail) continue;
      runs.push(foldEvents<D>({ author, homeserver, group: group.id }, tail, head, events.get(author) ?? []));
    }
    await attachBodies(ctx, runs);
    const scopes = runs.filter((run) => changesServed(run, stored.get(run.author) ?? null)).map(scopeOf);
    await commitRuns({ applyRuns: runs, ...readStateOf(ctx, homeserver) }, { scopes, seeds: [] });
  }

  /** Each homeserver's clock table, built again once the operation read more dated writes of it. */
  const tables = new WeakMap<TimeSample[], { size: number; table: TimeSample[] }>();
  function tableOf(ctx: OperationContext, homeserver: string): TimeSample[] {
    const samples = ctx.clocks.get(homeserver) ?? [];
    const known = tables.get(samples);
    if (known !== undefined && known.size === samples.length) return known.table;
    const table = buildTimeTable(samples, now());
    tables.set(samples, { size: samples.length, table });
    return table;
  }

  const windowStartMs = () => now() - options.windowDays * DAY_MS;

  /** The cursor the homeserver's clock places at the start of the window, `null` while it may lie below all it knows. */
  const cutoffOf = (ctx: OperationContext, homeserver: string): Cursor | null =>
    cursorAt(tableOf(ctx, homeserver), windowStartMs());

  /** Crawls the group for the users batch by batch, each from the tail `tailOf` gives for its stored head. */
  async function syncGroup(
    ctx: OperationContext,
    homeserver: string,
    group: PathGroup,
    users: readonly string[],
    tailOf: (head: Cursor | null) => Cursor,
  ) {
    for (const batch of chunks(users, options.batchSize)) {
      const heads = await storedHeads(homeserver, group, batch);
      const tails = new Map<string, Cursor>();
      for (const [user, head] of heads) tails.set(user, tailOf(head));
      await crawlBatch(ctx, homeserver, group, tails, heads);
    }
  }

  const fromHead = (head: Cursor | null) => head ?? CURSOR_ZERO;

  async function syncFull(ctx: OperationContext, homeserver: string, users: readonly string[]) {
    if (!(await ready(ctx, homeserver))) return;
    await guard(ctx, homeserver, async () => {
      for (const group of fullGroups) await syncGroup(ctx, homeserver, group, users, fromHead);
    });
  }

  /**
   * Keeps each user's windowed groups covered from their newest event down to the cutoff, the cursor the homeserver's
   * clock places at the start of the window. A user whose head the clock places inside the window catches up forward
   * from it; then one whose top range does not reach the cutoff, as after a sync that stopped halfway, is read newest
   * first below it unless it holds `windowMaxEntries` paths already. A user with no history, or whose head lies before
   * the window, as on a device closed for longer than it, is read newest first from their newest event, down to the
   * cutoff or their head, so what a feed shows first arrives first and nothing older than the window is read forward.
   */
  async function syncWindow(ctx: OperationContext, homeserver: string, users: readonly string[]) {
    if (windowGroups.length === 0 || !(await ready(ctx, homeserver))) return;
    await guard(ctx, homeserver, async () => {
      for (const group of windowGroups) {
        const startMs = windowStartMs();
        const forward: string[] = [];
        const below = new Map<string, WindowBound>();
        for (const user of users) {
          const head = headOf(await store.readCoverage({ author: user, homeserver, group: group.id }));
          // A clock with no sample yet says nothing: catching up is what the user's stored history asks for.
          if (head !== null && (estimateMs(tableOf(ctx, homeserver), head) ?? startMs) >= startMs) forward.push(user);
          else below.set(user, { top: null, floor: head, held: 0 });
        }
        await syncGroup(ctx, homeserver, group, forward, fromHead);
        const cutoff = cutoffOf(ctx, homeserver);
        for (const user of forward) {
          const scope = { author: user, homeserver, group: group.id };
          const tail = topTailOf(await store.readCoverage(scope));
          if (tail === null || tail === CURSOR_ZERO || (cutoff !== null && tail <= cutoff)) continue;
          const { entries } = await store.readScope(scope);
          const held = [...entries.values()].filter(({ cursor }) => cursor > tail).length;
          if (held < options.windowMaxEntries) below.set(user, { top: tail, floor: null, held });
        }
        await readWindowBelow(ctx, homeserver, group, below);
      }
    });
  }

  /**
   * Reads the users' windowed group newest first from each one's top down to where their read stops: the cutoff, once
   * the homeserver's clock places it, their floor, their `windowMaxEntries`-th path or their stream start. Every page
   * read adds its dated writes to the clock, which every batch of the homeserver shares: until the clock holds a write
   * older than the window, a batch keeps reading. The batches commit as one stream, newest events first: a round
   * commits what every batch has read, everything above the highest point a batch still reading has reached, while
   * that batch reads its next page.
   */
  async function readWindowBelow(
    ctx: OperationContext,
    homeserver: string,
    group: PathGroup,
    bounds: ReadonlyMap<string, WindowBound>,
  ) {
    if (bounds.size === 0) return;
    const limit = options.pageLimit;
    const read = reader(ctx, homeserver, group.paths, limit);
    interface Batch {
      /** Per user, the head of the range still to commit. */
      tops: Map<string, Cursor>;
      /** Users whose read has not stopped yet. */
      reading: Set<string>;
      /** Per user whose read stopped, where. */
      ends: Map<string, Cursor>;
      /** Per user, the paths read. */
      paths: Map<string, Set<string>>;
      /** Read and not committed yet. */
      events: AuthoredStreamEvent[];
      /** Every event of the users still reading above it is read. */
      low: Cursor;
    }
    const end = (batch: Batch, user: string, cursor: Cursor) => {
      batch.reading.delete(user);
      batch.ends.set(user, cursor);
    };
    /** Where the user's read stops once everything above it is read: the higher of the cutoff and their floor. */
    const stopOf = (user: string, cutoff: Cursor | null): Cursor | null => {
      const floor = bounds.get(user)?.floor ?? null;
      return floor === null ? cutoff : cutoff === null || floor > cutoff ? floor : cutoff;
    };
    /** Stops the users whose reads everything above their stop is read for. */
    const settle = (batch: Batch) => {
      const cutoff = cutoffOf(ctx, homeserver);
      for (const user of [...batch.reading]) {
        const stop = stopOf(user, cutoff);
        if (stop !== null && batch.low <= stop) end(batch, user, stop);
      }
    };
    /** Takes in a page of the users still reading. A full page holds all their events down to its lowest cursor. */
    const take = (batch: Batch, page: readonly AuthoredStreamEvent[]) => {
      const cutoff = cutoffOf(ctx, homeserver);
      for (const event of [...page].sort((a, b) => (a.cursor > b.cursor ? -1 : 1))) {
        const user = event.author;
        if (!batch.reading.has(user)) continue;
        const stop = stopOf(user, cutoff);
        if (stop !== null && event.cursor <= stop) {
          end(batch, user, stop);
          continue;
        }
        const paths = batch.paths.get(user) ?? new Set<string>();
        batch.paths.set(user, paths);
        if (!paths.has(event.path)) {
          // The range keeps the user's newest paths: it ends just above the first one past the bound.
          if ((bounds.get(user)?.held ?? 0) + paths.size >= options.windowMaxEntries) {
            end(batch, user, event.cursor);
            continue;
          }
          paths.add(event.path);
        }
        batch.events.push(event);
      }
      const lowest = lowestOf(page);
      batch.low = page.length >= limit && lowest !== null ? lowest - ONE : CURSOR_ZERO;
      settle(batch);
      // The stream start: whoever is still reading has nothing older.
      if (batch.low === CURSOR_ZERO) for (const user of [...batch.reading]) end(batch, user, CURSOR_ZERO);
    };
    const readFirst = async (users: Array<[string, WindowBound]>): Promise<Batch> => {
      const page = await read(
        users.map(([user, { top }]) => ({ user, cursor: top === null ? null : top + ONE })),
        true,
      );
      const newest = page.length === 0 ? null : highestOf(page);
      const tops = new Map<string, Cursor>();
      for (const [user, bound] of users) {
        // A user read from the newest event with none in the page has no event above the page's newest.
        const top = bound.top ?? newest;
        if (top !== null) tops.set(user, top);
      }
      const batch: Batch = {
        tops,
        reading: new Set(users.map(([user]) => user)),
        ends: new Map(),
        paths: new Map(),
        events: [],
        low: CURSOR_ZERO,
      };
      take(batch, page);
      return batch;
    };
    const readMore = async (batch: Batch) => {
      const page = await read(
        [...batch.reading].map((user) => {
          const top = batch.tops.get(user) ?? batch.low;
          return { user, cursor: (top < batch.low ? top : batch.low) + ONE };
        }),
        true,
      );
      take(batch, page);
    };
    const batches = await Promise.all(chunks([...bounds], options.batchSize).map(readFirst));
    for (;;) {
      // Another batch's page may have placed the cutoff.
      for (const batch of batches) settle(batch);
      const reading = batches.filter((batch) => batch.reading.size > 0);
      const cut = reading.reduce<Cursor | null>((high, { low }) => (high === null || low > high ? low : high), null);
      const parts: Below[] = [];
      for (const batch of batches) {
        const ranges = new Map<string, { top: Cursor; tail: Cursor }>();
        for (const [user, top] of batch.tops) {
          const ended = batch.ends.get(user);
          // A user still reading is committed down to the cut, which a batch still reading always sets.
          const tail = ended === undefined || (cut !== null && cut > ended) ? (cut ?? batch.low) : ended;
          if (top > tail) ranges.set(user, { top, tail });
          if (tail === ended) batch.tops.delete(user);
          else if (top > tail) batch.tops.set(user, tail);
        }
        const inRange = (event: AuthoredStreamEvent) => {
          const range = ranges.get(event.author);
          return range !== undefined && event.cursor > range.tail && event.cursor <= range.top;
        };
        parts.push({ ranges, events: batch.events.filter(inRange) });
        batch.events = batch.events.filter((event) => {
          const top = batch.tops.get(event.author);
          const ended = batch.ends.get(event.author);
          return top !== undefined && event.cursor <= top && (ended === undefined || event.cursor > ended);
        });
      }
      const next = reading.find(({ low }) => low === cut);
      const settled = await Promise.allSettled([
        commitBelow(ctx, homeserver, group, parts),
        next === undefined ? Promise.resolve() : readMore(next),
      ]);
      for (const outcome of settled) if (outcome.status === 'rejected') throw outcome.reason;
      if (next === undefined) break;
    }
  }

  /**
   * Commits backwards reads of one homeserver as one stream: their events in slices of `backfillPageLimit`, newest
   * first. A slice commits once its files to render and every newer slice are in, so the top range only grows
   * downwards and a failure keeps every slice above it; the files of all slices are fetched together.
   */
  async function commitBelow(ctx: OperationContext, homeserver: string, group: PathGroup, parts: readonly Below[]) {
    const newestFirst = parts.flatMap(({ events }) => events).sort((a, b) => (a.cursor > b.cursor ? -1 : 1));
    const slices: Run<D>[][] = [];
    let high: Cursor | null = null;
    for (let i = 0; i === 0 || i < newestFirst.length; i += options.backfillPageLimit) {
      const slice = newestFirst.slice(i, i + options.backfillPageLimit);
      const last = i + options.backfillPageLimit >= newestFirst.length;
      const low = last ? null : slice[slice.length - 1].cursor - ONE;
      const runs: Run<D>[] = [];
      for (const part of parts) {
        for (const [author, range] of part.ranges) {
          const tail = low === null || range.tail > low ? range.tail : low;
          const head = high === null || range.top < high ? range.top : high;
          if (head <= tail) continue;
          const own = slice.filter((event) => event.author === author && event.cursor > tail && event.cursor <= head);
          runs.push(foldEvents<D>({ author, homeserver, group: group.id }, tail, head, own));
        }
      }
      slices.push(runs);
      high = low;
    }
    const records = slices.flatMap((runs, index) =>
      runs.flatMap((run) =>
        run.entries.flatMap((entry) =>
          entry.kind === 'record' && domain.needsBody(entry.path) === 'render' ? [{ index, run, record: entry }] : [],
        ),
      ),
    );
    const pending = slices.map((_, index) => records.filter((item) => item.index === index).length);
    let next = 0;
    let stopped = false;
    const errors: unknown[] = [];
    let committing = Promise.resolve();
    const flush = () => {
      // Once a fetch failed, a fetch still in flight that ends later commits nothing after this call is over.
      while (!stopped && next < slices.length && pending[next] === 0) {
        const runs = slices[next];
        next += 1;
        // A slice whose newer one failed is not committed: it would sit below a gap.
        committing = committing
          .then(() => {
            if (errors.length > 0) return undefined;
            return commitRuns(
              { applyRuns: runs, ...readStateOf(ctx, homeserver) },
              { scopes: runs.map(scopeOf), seeds: [] },
            );
          })
          .catch((error: unknown) => {
            errors.push(error);
          });
      }
    };
    flush();
    try {
      await mapLimit(records, options.homeserverConcurrency, async ({ index, run, record }) => {
        const data = await bodyOf(ctx, homeserver, run.author, record);
        if (data !== null) record.data = data;
        pending[index] -= 1;
        flush();
      });
    } finally {
      stopped = true;
      await committing;
    }
    if (errors.length > 0) throw errors[0];
  }

  /**
   * The windowed groups of users loaded one by one, newest first, with no cutoff to look for and no range
   * read twice. A user whose history ends within a page of their newest event catches up forward from its head;
   * any other gets their newest page, read backwards as `backfill` reads, and `backfill` closes the gap below it.
   */
  async function syncNewest(ctx: OperationContext, homeserver: string, users: readonly string[]) {
    if (windowGroups.length === 0 || !(await ready(ctx, homeserver))) return;
    await guard(ctx, homeserver, async () => {
      for (const group of windowGroups) {
        for (const user of users) {
          const scope = { author: user, homeserver, group: group.id };
          if (!(await catchUp(ctx, scope, group))) await readPageBelow(ctx, scope, group, null);
        }
      }
    });
  }

  /**
   * Reads one page of `backfillPageLimit` events forward from the scope's head and commits it when it is not full,
   * the scope then holding everything up to the newest event. False, with nothing committed, for a scope with no
   * history or one more than a page behind.
   */
  async function catchUp(ctx: OperationContext, scope: ScopeKey, group: PathGroup): Promise<boolean> {
    const head = headOf(await store.readCoverage(scope));
    if (head === null) return false;
    const limit = options.backfillPageLimit;
    const page = await reader(ctx, scope.homeserver, group.paths, limit)([{ user: scope.author, cursor: head }], false);
    if (page.length >= limit) return false;
    if (page.length === 0) return true;
    const run = foldEvents<D>(scope, head, highestOf(page), page);
    await attachBodies(ctx, [run]);
    await commitRuns(
      { applyRuns: [run], ...readStateOf(ctx, scope.homeserver) },
      { scopes: [scopeOf(run)], seeds: [] },
    );
    return true;
  }

  /** Runs `work` for every homeserver at once, so a slow one holds up none of the others; rethrows after all end. */
  async function eachHomeserver<T>(
    byHomeserver: ReadonlyMap<string, T>,
    work: (homeserver: string, items: T) => Promise<void>,
  ) {
    const errors: unknown[] = [];
    await Promise.all(
      [...byHomeserver].map(([homeserver, items]) =>
        work(homeserver, items).catch((error: unknown) => {
          errors.push(error);
        }),
      ),
    );
    if (errors.length > 0) throw errors[0];
  }

  /** The user's homeserver from the store while fresh, else from the transport; a failed lookup keeps the old. */
  async function resolve(ctx: OperationContext, user: string): Promise<string | null> {
    throwIfAborted(ctx.signal);
    let pending = lookups.get(user);
    if (pending === undefined) {
      pending = lookUp(user).finally(() => lookups.delete(user));
      lookups.set(user, pending);
    }
    // A shared lookup outlives this operation, so an abort leaves it running for the others.
    return untilAborted(pending, ctx.signal);
  }

  async function lookUp(user: string): Promise<string | null> {
    const cached = await store.readUserHomeserver(user);
    if (cached !== null && now() - cached.resolvedAt < options.homeserverTtlMs) return cached.homeserver;
    count('lookups');
    let homeserver: string | null;
    try {
      homeserver = await withDeadline(() => transport.resolveHomeserver(user), options.lookupTimeoutMs, schedule);
    } catch (error) {
      if (!(error instanceof IndexerError)) throw error;
      return cached?.homeserver ?? null;
    }
    await store.writeUserHomeserver(user, { homeserver, resolvedAt: now() });
    return homeserver;
  }

  /** Resolves the users and groups the resolved ones by homeserver. */
  async function resolveAll(ctx: OperationContext, users: readonly string[]) {
    const resolved = await mapLimit(users, options.lookupConcurrency, (user) => resolve(ctx, user));
    const homeserverOf = new Map(users.map((user, i): [string, string | null] => [user, resolved[i]]));
    const byHomeserver = new Map<string, string[]>();
    for (const [user, homeserver] of homeserverOf) {
      if (homeserver === null) continue;
      seen.add(homeserver);
      byHomeserver.set(homeserver, [...(byHomeserver.get(homeserver) ?? []), user]);
    }
    changed();
    return { homeserverOf, byHomeserver };
  }

  /** Users the frontier links to that are not in scope yet, added to `members` until the cap. */
  async function nextHop(
    frontier: readonly string[],
    homeserverOf: ReadonlyMap<string, string | null>,
    members: Map<string, number>,
    hop: number,
    skipped: ReadonlySet<string>,
  ): Promise<string[]> {
    const next: string[] = [];
    for (const user of frontier) {
      const homeserver = homeserverOf.get(user) ?? null;
      if (homeserver === null) continue;
      const { live, entries } = await store.readScope({ author: user, homeserver, group: scopeGroupId });
      for (const link of domain.linksOf(live, entries)) {
        if (members.size >= options.maxUsers) return next;
        if (members.has(link) || skipped.has(link)) continue;
        members.set(link, hop);
        next.push(link);
      }
    }
    return next;
  }

  async function syncScope(seed: string, signal?: AbortSignal): Promise<SyncResult> {
    // Nobody waits for it: the requests of an operation someone waits for go first at each homeserver.
    const ctx = contextOf(signal, 'background');
    Object.assign(counters, { usersPerHop: [], lookups: 0, streamRequests: 0, bodyRequests: 0, events: 0 });
    seedReach = undefined;
    seen.clear();
    failed.clear();
    changed();

    const before = await store.readScopeMembers(seed);
    let written: ReadonlyMap<string, number> = before;
    /** Commits the members when they differ from the stored ones, or always when `always`. */
    const publish = async (next: ReadonlyMap<string, number>, always: boolean) => {
      const same = sameMembers(written, next);
      if (same && !always) return;
      await commit({ scopeMembers: [{ seed, members: next }] }, { scopes: [], seeds: same ? [] : [seed] });
      written = next;
    };

    // A change of the excluded users applies from the next sync on, never halfway through one.
    const skipped = excluded;
    const members = new Map([[seed, 0]]);
    let frontier = [seed];
    let resolving = resolveAll(ctx, frontier);
    /** Each hop's activity, read beside its graph and the hops after it; failures wait for the end. */
    const windows: Promise<void>[] = [];
    const errors: unknown[] = [];
    try {
      for (let hop = 0; frontier.length > 0; hop += 1) {
        counters.usersPerHop.push(frontier.length);
        changed();
        const { homeserverOf, byHomeserver } = await resolving;
        // The window read needs no link, so a feed's newest posts do not wait for the hop's whole graph.
        const window = eachHomeserver(byHomeserver, (homeserver, users) => syncWindow(ctx, homeserver, users));
        windows.push(
          window
            .then(() => {
              if (hop > 0) return;
              const homeserver = homeserverOf.get(seed) ?? null;
              seedReach = { homeserver, failed: homeserver !== null && ctx.failed.has(homeserver) };
              changed();
            })
            .catch((error: unknown) => {
              errors.push(error);
            }),
        );
        await eachHomeserver(byHomeserver, (homeserver, users) => syncFull(ctx, homeserver, users));
        const next = hop < options.hops ? await nextHop(frontier, homeserverOf, members, hop + 1, skipped) : [];
        // Lookups go to the resolvers, not the homeservers: the next hop's run while this hop's activity is read.
        resolving = resolveAll(ctx, next);
        // Awaited at the next hop; when this one throws first, its rejection is dropped here.
        resolving.catch(() => undefined);
        throwIfAborted(signal);
        // The hop's graph names the next one: they join the stored members at once, so answers grow during a first
        // sync, the seed's as soon as its profile and follows are in. None leaves before the sync ends.
        await publish(new Map([...before, ...members]), false);
        frontier = next;
      }
    } finally {
      await Promise.all(windows);
    }
    if (errors.length > 0) throw errors[0];
    throwIfAborted(signal);
    await publish(members, true);
    return { members, failedHomeservers: [...ctx.failed] };
  }

  async function syncUsers(users: readonly string[], signal?: AbortSignal): Promise<SyncOutcome> {
    const ctx = contextOf(signal);
    const { byHomeserver } = await resolveAll(ctx, [...new Set(users)]);
    await eachHomeserver(byHomeserver, (homeserver, batch) => syncFull(ctx, homeserver, batch));
    await eachHomeserver(byHomeserver, (homeserver, batch) => syncNewest(ctx, homeserver, batch));
    throwIfAborted(signal);
    return { failedHomeservers: [...ctx.failed] };
  }

  function leafError({ group, paths }: LeafRequest): InvalidIndexInputError | null {
    if (domain.groups.some(({ id }) => id === group)) {
      return new InvalidIndexInputError(`leaf group ${group} is one of the domain's groups`);
    }
    // The restore check re-reads an author's newest event over the domain's paths, so a leaf stays inside them.
    if (paths.length === 0 || !paths.every((path) => allPaths.some((prefix) => path.startsWith(prefix)))) {
      return new InvalidIndexInputError(`leaf paths of ${group} must lie inside the domain's paths`);
    }
    return null;
  }

  async function syncLeaves(leaves: readonly LeafRequest[], signal?: AbortSignal): Promise<LeavesOutcome> {
    const refused = leaves.map(leafError);
    const valid = leaves.filter((_, i) => refused[i] === null);
    const ctx = contextOf(signal);
    const { homeserverOf, byHomeserver } = await resolveAll(ctx, [...new Set(valid.map(({ author }) => author))]);
    // One restore check per homeserver, before any leaf of it is read.
    const readable = new Set<string>();
    for (const homeserver of byHomeserver.keys()) if (await ready(ctx, homeserver)) readable.add(homeserver);
    await Promise.all(
      valid.map(async ({ author, group, paths }) => {
        const homeserver = homeserverOf.get(author) ?? null;
        if (homeserver === null || !readable.has(homeserver)) return;
        const leaf: PathGroup = { id: group, paths: [...paths], history: 'full' };
        await guard(ctx, homeserver, () => syncGroup(ctx, homeserver, leaf, [author], fromHead));
      }),
    );
    throwIfAborted(signal);
    return { failedHomeservers: [...ctx.failed], refused };
  }

  async function syncLeaf(leaf: LeafRequest, signal?: AbortSignal): Promise<SyncOutcome> {
    const error = leafError(leaf);
    if (error !== null) throw error;
    const { failedHomeservers } = await syncLeaves([leaf], signal);
    return { failedHomeservers };
  }

  /**
   * Reads the page of `backfillPageLimit` events below `below`, a tail of the scope, or the newest page when `null`,
   * fetches the files the page needs to render and commits it. Its events, `null` when the newest page was empty:
   * the author has no event in the group.
   */
  async function readPageBelow(
    ctx: OperationContext,
    scope: ScopeKey,
    group: PathGroup,
    below: Cursor | null,
  ): Promise<number | null> {
    const limit = options.backfillPageLimit;
    // The tail itself is outside its range, so the read starts one above it.
    const page = await reader(
      ctx,
      scope.homeserver,
      group.paths,
      limit,
    )([{ user: scope.author, cursor: below === null ? null : below + ONE }], true);
    if (below === null && page.length === 0) return null;
    const lowest = lowestOf(page);
    // A full page holds every event down to its lowest cursor; a shorter one reached the stream start. The newest
    // page ends at the newest event read: nothing above it exists yet.
    const tail = page.length >= limit && lowest !== null ? lowest - ONE : CURSOR_ZERO;
    const ranges = new Map([[scope.author, { top: below ?? highestOf(page), tail }]]);
    await commitBelow(ctx, scope.homeserver, group, [{ ranges, events: page }]);
    return page.length;
  }

  async function backfill(author: string, groupId: string, pages: number, signal?: AbortSignal) {
    const group = domain.groups.find(({ id }) => id === groupId);
    if (group === undefined) throw new InvalidIndexInputError(`unknown group ${groupId}`);
    const ctx = contextOf(signal);
    const homeserver = (await store.readUserHomeserver(author))?.homeserver ?? null;
    if (homeserver === null) return { tail: null, pages: 0, events: 0 };
    const scope = { author, homeserver, group: group.id };
    // Like every read, under the epoch the restore check confirms, so a page read before a restore is never kept. A
    // step right after another shares its check: a restore found meanwhile moved the epoch, refusing what it read.
    const state = await store.readHomeserverState(homeserver);
    const shared = backfillChecks.get(homeserver);
    const fresh = shared !== undefined && shared.epoch === state.epoch && now() - shared.at < options.backfillCheckMs;
    if (fresh) {
      ctx.epochs.set(homeserver, state.epoch);
      ctx.clocks.set(homeserver, state.clock);
      ctx.checked.set(homeserver, Promise.resolve(true));
    }
    if (!(await ready(ctx, homeserver)))
      return { tail: topTailOf(await store.readCoverage(scope)), pages: 0, events: 0 };
    const epoch = ctx.epochs.get(homeserver);
    if (!fresh && epoch !== undefined) backfillChecks.set(homeserver, { epoch, at: now() });
    let events = 0;
    let done = 0;
    for (; done < pages; done += 1) {
      // Read each time: the last run may have joined a lower stored range, and reading resumes below it. Without a
      // range, as after a window that held none of the author's events, it starts at their newest event.
      const tail = topTailOf(await store.readCoverage(scope));
      if (tail === CURSOR_ZERO) break;
      const read = await readPageBelow(ctx, scope, group, tail);
      if (read === null) break;
      events += read;
    }
    return { tail: topTailOf(await store.readCoverage(scope)), pages: done, events };
  }

  async function hydrate(scopes: Iterable<ScopeKey> = [], signal?: AbortSignal): Promise<HydrateResult> {
    // It keeps what is shown complete, as a scope sync keeps it current: both queue in the same place.
    const ctx = contextOf(signal, 'background');
    // Stored records of these scopes may lack their files, as after a session that closed before its fill.
    for (const scope of scopes) {
      throwIfAborted(signal);
      // Taken before the records are, so a fill of a record read before a restore commits nothing.
      const { epoch } = await store.readHomeserverState(scope.homeserver);
      const { live } = await store.readScope(scope);
      for (const record of live.values()) {
        if (record.data === undefined && domain.needsBody(record.path) !== null) noteEntry(scope, record, epoch, true);
      }
    }
    /** Per homeserver, the records to fetch, newest first: a tag names its post only in its file. */
    const queues = new Map<string, Heap<Unfilled<D>>>();
    const drains = new Map<string, Promise<void>>();
    const errors: unknown[] = [];
    let fetched = 0;

    const enqueue = (item: Unfilled<D>) => {
      const { homeserver } = item.scope;
      let queue = queues.get(homeserver);
      if (queue === undefined) {
        queue = createHeap((a, b) => a.record.cursor > b.record.cursor);
        queues.set(homeserver, queue);
      }
      queue.push(item);
      if (drains.has(homeserver)) return;
      drains.set(
        homeserver,
        drain(homeserver)
          .catch((error: unknown) => {
            errors.push(error);
          })
          .finally(() => drains.delete(homeserver)),
      );
    };
    /** The homeserver's newest record still to fetch; one replaced or dropped since it was queued is skipped. */
    const next = (homeserver: string): Unfilled<D> | undefined => {
      const queue = queues.get(homeserver);
      for (let item = queue?.pop(); item !== undefined; item = queue?.pop()) if (isUnfilled(item)) return item;
      return undefined;
    };

    /** Fetches the homeserver's queue; a failing homeserver leaves the rest untried, for a later call. */
    async function drain(homeserver: string): Promise<void> {
      if (ctx.failed.has(homeserver)) return;
      const { failure } = await store.readHomeserverState(homeserver);
      if (failure !== null && failure.retryAt > now()) {
        markFailed(ctx, homeserver);
        return;
      }
      let stopped = false;
      const worker = async () => {
        for (;;) {
          const item = stopped ? undefined : next(homeserver);
          if (item === undefined) return;
          try {
            await fill(item);
          } catch (error) {
            stopped = true;
            throw error;
          }
        }
      };
      await guard(ctx, homeserver, async () => {
        await Promise.all(Array.from({ length: options.homeserverConcurrency }, worker));
      });
    }

    async function fill(item: Unfilled<D>): Promise<void> {
      const { scope, record, epoch } = item;
      const data = await bodyOf(ctx, scope.homeserver, scope.author, record);
      if (data !== null) {
        // Committed at once, so a stopped call keeps every file it got. Crawls run beside it: one that replaced,
        // forgot or dropped the record meanwhile wins, and the data is set on nothing.
        await commit(
          {
            readAt: [{ homeserver: scope.homeserver, epoch }],
            recordData: [{ scope: scopeOf(scope), path: record.path, cursor: record.cursor, data }],
          },
          { scopes: [scopeOf(scope)], seeds: [] },
        );
        fetched += 1;
      }
      // A file that is gone or fails its hash waits for a later event of its path.
      settleUnfilled(item);
    }

    fills.add(enqueue);
    try {
      for (const paths of unfilled.values()) for (const item of paths.values()) enqueue(item);
      while (drains.size > 0) await Promise.all([...drains.values()]);
    } finally {
      fills.delete(enqueue);
    }
    if (errors.length > 0) throw errors[0];
    const waiting = new Set(
      [...unfilled.values()].flatMap((paths) => [...paths.values()].map(({ scope }) => scope.homeserver)),
    );
    return { fetched, remaining: unfilledCount, failedHomeservers: [...ctx.failed].filter((hs) => waiting.has(hs)) };
  }

  /** Forgets the records of these scopes still to fill, which a `forget` deletes. */
  function forgetUnfilled(scopes: readonly ScopeKey[]): void {
    const ids = new Set(scopes.map(scopeId));
    dropUnfilled((scope) => !ids.has(scopeId(scope)));
  }

  return {
    syncScope,
    backfill,
    syncUsers,
    syncLeaf,
    syncLeaves,
    hydrate,
    unfilled: () => unfilledCount,
    forgetUnfilled,
    setExcluded(users) {
      excluded = new Set(users);
    },
    stats,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    onCommit(listener) {
      commitListeners.add(listener);
      return () => {
        commitListeners.delete(listener);
      };
    },
  };
}
