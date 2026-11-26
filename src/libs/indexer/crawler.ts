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
import {
  HomeserverUnreachableError,
  IndexerAbortedError,
  IndexerError,
  InvalidIndexInputError,
  RateLimitedError,
  RequestTimeoutError,
} from './indexer.errors';
import type { Coverage, Cursor, RecordEntry, Run } from './indexer.types';
import { readBackward, readForward, type ReadPage } from './paging';
import { foldEvents } from './run';
import { scopeId, scopeOf } from './store.helpers';
import type { HighWater, ScopeKey, StoreBatch } from './store.types';
import type { AuthoredStreamEvent } from './transport.types';

const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_START_TTL_MS = DAY_MS;
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
  highWater: Map<string, HighWater | null>;
  windowStart: Map<string, Cursor>;
  /** Homeservers failed or backing off, skipped for the rest of the operation. */
  failed: Set<string>;
}

/** A write older than the window: its cursor and the time its path names. */
interface OldWrite {
  cursor: Cursor;
  time: bigint;
}

/** Users' events in `(tail, top]` to commit newest first, read by one request. */
interface Below {
  tops: ReadonlyMap<string, Cursor>;
  tail: Cursor;
  events: readonly AuthoredStreamEvent[];
}

const contextOf = (signal?: AbortSignal, priority: Priority = 'foreground'): OperationContext => ({
  signal,
  priority,
  checked: new Map(),
  highWater: new Map(),
  windowStart: new Map(),
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

const newestOf = (current: HighWater | null, event: AuthoredStreamEvent | null): HighWater | null =>
  event !== null && (current === null || event.cursor > current.cursor)
    ? { cursor: event.cursor, author: event.author }
    : current;

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
  const windowPaths = windowGroups.flatMap((group) => group.paths);

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
  /** Records `hydrate` fetched once, by scope, path and cursor. */
  const hydrated = new Set<string>();
  /**
   * Scopes that may hold records without the file they need, by scope id, for `hydrate`, each with the mark it got
   * when it was last added: a fill that read a scope at an older mark reads it again.
   */
  const unfilled = new Map<string, { scope: ScopeKey; mark: number }>();
  let unfilledMark = 0;
  const markUnfilled = (scope: ScopeKey) => {
    unfilledMark += 1;
    unfilled.set(scopeId(scope), { scope: scopeOf(scope), mark: unfilledMark });
  };
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
    ctx.highWater.set(homeserver, highWater);
    if (highWater === null) return;
    const newest = await reader(ctx, homeserver, allPaths, 1)([{ user: highWater.author, cursor: null }], true);
    if (newest.length > 0 && newest[0].cursor >= highWater.cursor) return;
    const scopes = (await store.listScopes()).filter((scope) => scope.homeserver === homeserver);
    await commit(
      {
        deleteHomeservers: [homeserver],
        homeserverStates: [{ homeserver, patch: { highWater: null, windowStart: null } }],
      },
      { scopes, seeds: [] },
    );
    ctx.highWater.set(homeserver, null);
    ctx.windowStart.delete(homeserver);
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

  /** Commits fresh runs and leaves the files of their `later` records to the next `hydrate`. */
  async function commitRuns(batch: StoreBatch<D>, change: StoreChange): Promise<void> {
    await commit(batch, change);
    for (const run of batch.applyRuns ?? []) {
      if (run.entries.some((entry) => entry.kind === 'record' && domain.needsBody(entry.path) === 'later')) {
        markUnfilled(run);
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
    const { heads, events, newest } = await readForward(tails, options.pageLimit, read);
    const runs: Run<D>[] = [];
    for (const [author, tail] of tails) {
      const head = heads.get(author) ?? tail;
      if (head <= tail) continue;
      runs.push(foldEvents<D>({ author, homeserver, group: group.id }, tail, head, events.get(author) ?? []));
    }
    await attachBodies(ctx, runs);
    // Taken and set with no await between, so batches read together never write an older mark over a newer one.
    const highWater = newestOf(ctx.highWater.get(homeserver) ?? null, newest);
    ctx.highWater.set(homeserver, highWater);
    const scopes = runs.filter((run) => changesServed(run, stored.get(run.author) ?? null)).map(scopeOf);
    await commitRuns(
      { applyRuns: runs, homeserverStates: [{ homeserver, patch: { highWater, failure: null } }] },
      { scopes, seeds: [] },
    );
  }

  const microsBefore = (ms: number) => BigInt(Math.floor(now() - ms)) * MICROS_PER_MS;

  /**
   * The newest write in the page older than the window. Only a write dates its cursor: a delete of an old path can
   * happen any time later.
   */
  function olderThanWindow(page: readonly AuthoredStreamEvent[]): OldWrite | null {
    const cutoff = microsBefore(options.windowDays * DAY_MS);
    return page.reduce<OldWrite | null>((found, event) => {
      const time = event.type === 'PUT' ? domain.timeOfPath(event.path) : null;
      const older = time !== null && time < cutoff;
      return older && (found === null || event.cursor > found.cursor) ? { cursor: event.cursor, time } : found;
    }, null);
  }

  /**
   * Keeps a write found older than the window as the homeserver's window start once it settles it: within a tenth of
   * the window from its edge. The users only sample the homeserver's cursor, so a seed whose last old post is a year
   * old would otherwise set a year-wide window for everyone after it.
   */
  async function settleWindowStart(ctx: OperationContext, homeserver: string, found: OldWrite): Promise<boolean> {
    const windowMs = options.windowDays * DAY_MS;
    if (found.time < microsBefore(windowMs + windowMs / 10)) return false;
    const known = ctx.windowStart.get(homeserver);
    if (known !== undefined && known >= found.cursor) return true;
    await store.patchHomeserverState(homeserver, { windowStart: { cursor: found.cursor, foundAt: now() } });
    ctx.windowStart.set(homeserver, found.cursor);
    return true;
  }

  /** The homeserver's settled window start this operation found or the store keeps while fresh, else `null`. */
  async function knownWindowStart(ctx: OperationContext, homeserver: string): Promise<Cursor | null> {
    const known = ctx.windowStart.get(homeserver);
    if (known !== undefined) return known;
    const { windowStart } = await store.readHomeserverState(homeserver);
    if (windowStart === null || now() - windowStart.foundAt >= WINDOW_START_TTL_MS) return null;
    ctx.windowStart.set(homeserver, windowStart.cursor);
    return windowStart.cursor;
  }

  /**
   * The highest cursor of a write older than the window, read backwards over the windowed paths one batch at a
   * time. Zero when none has one: the users' history is younger than the window. The search goes on through the
   * batches until a write settles it; an unsettled one serves this call alone, and the next call searches again.
   */
  async function windowStartOf(ctx: OperationContext, homeserver: string, users: readonly string[]) {
    const known = await knownWindowStart(ctx, homeserver);
    if (known !== null) return known;
    const read = reader(ctx, homeserver, windowPaths, options.pageLimit);
    let best: OldWrite | null = null;
    for (const batch of chunks(users, options.batchSize)) {
      const found = await readBackward(batch, options.pageLimit, read, olderThanWindow);
      if (found !== null && (best === null || found.cursor > best.cursor)) best = found;
      if (best !== null && (await settleWindowStart(ctx, homeserver, best))) return best.cursor;
    }
    return best?.cursor ?? CURSOR_ZERO;
  }

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
   * Keeps each user's windowed groups covered from their newest event down to the window start. A user with history
   * from the window start on catches up forward from its head. One with none, or with only older history, or whose
   * top range starts above the window start, as after a sync that stopped halfway, is read newest first below it, so
   * what a feed shows first arrives first. Without a known window start, as in a first sync, that read stops at the
   * first write older than the window, and no search for the start runs.
   */
  async function syncWindow(ctx: OperationContext, homeserver: string, users: readonly string[]) {
    if (windowGroups.length === 0 || !(await ready(ctx, homeserver))) return;
    await guard(ctx, homeserver, async () => {
      for (const group of windowGroups) {
        const coverage = new Map<string, Coverage>();
        for (const user of users) {
          coverage.set(user, await store.readCoverage({ author: user, homeserver, group: group.id }));
        }
        const known = users.filter((user) => headOf(coverage.get(user) ?? []) !== null);
        const start =
          known.length > 0 ? await windowStartOf(ctx, homeserver, known) : await knownWindowStart(ctx, homeserver);
        const current = (user: string) => {
          const head = headOf(coverage.get(user) ?? []);
          return head !== null && (start === null || head >= start);
        };
        await syncGroup(ctx, homeserver, group, known.filter(current), fromHead);
        const below = new Map<string, Cursor | null>();
        for (const user of users) {
          const tail = topTailOf(coverage.get(user) ?? []);
          if (!current(user)) below.set(user, null);
          else if (start !== null && tail !== null && tail > start) below.set(user, tail);
        }
        await readWindowBelow(ctx, homeserver, group, below, start);
      }
    });
  }

  /**
   * Reads the users' windowed group backwards from each one's bound, their newest event for `null`, down to `floor`,
   * or without one down to their batch's newest write older than the window, which may settle the homeserver's window
   * start. The batches of the homeserver commit as one stream, newest events first: a round commits what every batch
   * has read, everything above the highest point a batch still reading has reached, while that batch reads its next
   * page.
   */
  async function readWindowBelow(
    ctx: OperationContext,
    homeserver: string,
    group: PathGroup,
    bounds: ReadonlyMap<string, Cursor | null>,
    floor: Cursor | null,
  ) {
    const limit = options.pageLimit;
    const read = reader(ctx, homeserver, group.paths, limit);
    interface Batch {
      /** Per user, the head of the range still to commit. */
      tops: Map<string, Cursor>;
      /** Read and not committed yet. */
      events: AuthoredStreamEvent[];
      /** Every event of the batch above it is read. */
      low: Cursor;
      /** The read reached its end, `low` being every user's tail. */
      reached: boolean;
    }
    /** Where a page leaves its batch. A full page holds every event of the batch down to its lowest cursor. */
    const ending = async (page: readonly AuthoredStreamEvent[]) => {
      let stop = floor;
      const old = stop === null ? olderThanWindow(page) : null;
      if (old !== null) {
        stop = old.cursor;
        await settleWindowStart(ctx, homeserver, old);
      }
      const lowest = lowestOf(page);
      const reached = page.length < limit || lowest === null || (stop !== null && lowest <= stop);
      const low = reached ? (stop ?? CURSOR_ZERO) : lowest - ONE;
      return { low, reached, events: page.filter((event) => event.cursor > low) };
    };
    const readFirst = async (users: Array<[string, Cursor | null]>): Promise<Batch> => {
      const page = await read(
        users.map(([user, bound]) => ({ user, cursor: bound === null ? null : bound + ONE })),
        true,
      );
      const newest = page.length === 0 ? null : highestOf(page);
      // Taken and set with no await between, so reads together never keep an older mark over a newer one.
      const newestEvent = page.find((event) => event.cursor === newest) ?? null;
      ctx.highWater.set(homeserver, newestOf(ctx.highWater.get(homeserver) ?? null, newestEvent));
      const tops = new Map<string, Cursor>();
      for (const [user, bound] of users) {
        // A user read from the newest event with none in the page has no event in the group at all.
        const top = bound ?? newest;
        if (top !== null && (floor === null || top > floor)) tops.set(user, top);
      }
      return { tops, ...(await ending(page)) };
    };
    const readMore = async (batch: Batch) => {
      const page = await read(
        [...batch.tops].map(([user, top]) => ({ user, cursor: (top < batch.low ? top : batch.low) + ONE })),
        true,
      );
      const next = await ending(page);
      batch.events.push(...next.events);
      batch.low = next.low;
      batch.reached = next.reached;
    };
    if (bounds.size === 0) return;
    const batches = await Promise.all(chunks([...bounds], options.batchSize).map(readFirst));
    for (let round = 0; ; round += 1) {
      const reading = batches.filter((batch) => !batch.reached && batch.tops.size > 0);
      const cut = reading.reduce<Cursor | null>((high, { low }) => (high === null || low > high ? low : high), null);
      const parts: Below[] = [];
      for (const batch of batches) {
        const tail = cut === null || (batch.reached && batch.low > cut) ? batch.low : cut;
        parts.push({
          tops: new Map([...batch.tops].filter(([, top]) => top > tail)),
          tail,
          events: batch.events.filter((event) => event.cursor > tail),
        });
        batch.events = batch.events.filter((event) => event.cursor <= tail);
        for (const [user, top] of batch.tops) if (top > tail) batch.tops.set(user, tail);
        if (batch.reached && tail === batch.low) batch.tops.clear();
      }
      const next = reading.find(({ low }) => low === cut);
      const settled = await Promise.allSettled([
        commitBelow(ctx, homeserver, group, parts, round === 0),
        next === undefined ? Promise.resolve() : readMore(next),
      ]);
      for (const outcome of settled) if (outcome.status === 'rejected') throw outcome.reason;
      if (next === undefined) return;
    }
  }

  /**
   * Commits backwards reads of one homeserver as one stream: their events in slices of `backfillPageLimit`, newest
   * first. A slice commits once its files to render and every newer slice are in, so the top range only grows
   * downwards and a failure keeps every slice above it; the files of all slices are fetched together. With
   * `highWater` the first slice also stores the homeserver's high-water mark.
   */
  async function commitBelow(
    ctx: OperationContext,
    homeserver: string,
    group: PathGroup,
    parts: readonly Below[],
    highWater: boolean,
  ) {
    const newestFirst = parts.flatMap(({ events }) => events).sort((a, b) => (a.cursor > b.cursor ? -1 : 1));
    const slices: Run<D>[][] = [];
    let high: Cursor | null = null;
    for (let i = 0; i === 0 || i < newestFirst.length; i += options.backfillPageLimit) {
      const slice = newestFirst.slice(i, i + options.backfillPageLimit);
      const last = i + options.backfillPageLimit >= newestFirst.length;
      const low = last ? null : slice[slice.length - 1].cursor - ONE;
      const runs: Run<D>[] = [];
      for (const part of parts) {
        const tail = low === null || part.tail > low ? part.tail : low;
        for (const [author, top] of part.tops) {
          const head = high === null || top < high ? top : high;
          if (head <= tail) continue;
          const own = slice.filter((event) => event.author === author);
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
        const first = next === 0;
        next += 1;
        // A slice whose newer one failed is not committed: it would sit below a gap.
        committing = committing
          .then(() => {
            if (errors.length > 0) return undefined;
            // Read when it commits, so a mark another read stored meanwhile is never set back.
            const mark = ctx.highWater.get(homeserver) ?? null;
            const state =
              highWater && first
                ? { homeserverStates: [{ homeserver, patch: { highWater: mark, failure: null } }] }
                : {};
            return commitRuns({ applyRuns: runs, ...state }, { scopes: runs.map(scopeOf), seeds: [] });
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
   * The windowed groups of users loaded one by one, newest first, with no window start to search for and no range
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
    await commitRuns({ applyRuns: [run] }, { scopes: [scopeOf(run)], seeds: [] });
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
    const tops = new Map([[scope.author, below ?? highestOf(page)]]);
    await commitBelow(ctx, scope.homeserver, group, [{ tops, tail, events: page }], false);
    return page.length;
  }

  async function backfill(author: string, groupId: string, pages: number, signal?: AbortSignal) {
    const group = domain.groups.find(({ id }) => id === groupId);
    if (group === undefined) throw new InvalidIndexInputError(`unknown group ${groupId}`);
    const ctx = contextOf(signal);
    const homeserver = (await store.readUserHomeserver(author))?.homeserver ?? null;
    if (homeserver === null) return { tail: null, pages: 0, events: 0 };
    const scope = { author, homeserver, group: group.id };
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

  async function hydrate(
    scopes: Iterable<ScopeKey> = [],
    limit = Infinity,
    signal?: AbortSignal,
  ): Promise<HydrateResult> {
    // It keeps what is shown complete, as a scope sync keeps it current: both queue in the same place.
    const ctx = contextOf(signal, 'background');
    for (const scope of scopes) markUnfilled(scope);
    interface Item {
      scope: ScopeKey;
      record: RecordEntry<D>;
      key: string;
    }
    const items = new Map<string, Item>();
    /** Per homeserver, the records still to fetch, newest first. */
    const queues = new Map<string, Item[]>();
    /** The mark each scope was read at. */
    const scanned = new Map<string, number>();
    let seenMark = -1;
    let scanning: Promise<void> | null = null;
    const drains = new Map<string, Promise<void>>();
    const errors: unknown[] = [];
    let picked = 0;
    let fetched = 0;

    /** Reads the scopes marked since the last read, so records a crawl commits meanwhile join in cursor order. */
    async function scan(): Promise<void> {
      while (seenMark !== unfilledMark) {
        seenMark = unfilledMark;
        const grown = new Set<string>();
        for (const [id, { scope, mark }] of [...unfilled]) {
          if (scanned.get(id) === mark) continue;
          throwIfAborted(signal);
          scanned.set(id, mark);
          const { live } = await store.readScope(scope);
          for (const record of live.values()) {
            const key = `${id}\u0000${record.path}\u0000${record.cursor}`;
            if (record.data !== undefined || domain.needsBody(record.path) === null) continue;
            if (hydrated.has(key) || items.has(key)) continue;
            const item = { scope, record, key };
            items.set(key, item);
            queues.set(scope.homeserver, [...(queues.get(scope.homeserver) ?? []), item]);
            grown.add(scope.homeserver);
          }
        }
        for (const homeserver of grown) {
          queues.get(homeserver)?.sort((a, b) => (a.record.cursor > b.record.cursor ? -1 : 1));
          if (drains.has(homeserver)) continue;
          drains.set(
            homeserver,
            drain(homeserver)
              .catch((error: unknown) => {
                errors.push(error);
              })
              .finally(() => drains.delete(homeserver)),
          );
        }
      }
    }
    const absorb = (): Promise<void> => {
      if (seenMark === unfilledMark) return scanning ?? Promise.resolve();
      scanning ??= scan().finally(() => {
        scanning = null;
      });
      return scanning;
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
          await absorb();
          const item = stopped || picked >= limit ? undefined : queues.get(homeserver)?.shift();
          if (item === undefined) return;
          picked += 1;
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

    async function fill({ scope, record, key }: Item): Promise<void> {
      const data = await bodyOf(ctx, scope.homeserver, scope.author, record);
      hydrated.add(key);
      if (data === null) return;
      // Committed at once, so a stopped call keeps every file it got. Crawls run beside it: one that replaced,
      // forgot or dropped the record meanwhile wins, and the data is set on nothing.
      await commit(
        { recordData: [{ scope: scopeOf(scope), path: record.path, cursor: record.cursor, data }] },
        { scopes: [scopeOf(scope)], seeds: [] },
      );
      fetched += 1;
    }

    await absorb();
    while (drains.size > 0) await Promise.all([...drains.values()]);
    if (errors.length > 0) throw errors[0];
    const untried = [...items.values()].filter(({ key }) => !hydrated.has(key));
    const left = new Set(untried.map(({ scope }) => scopeId(scope)));
    // A scope a crawl committed `later` records to again since it was read stays for the next call.
    for (const [id, mark] of scanned) if (!left.has(id) && unfilled.get(id)?.mark === mark) unfilled.delete(id);
    return { fetched, remaining: untried.length };
  }

  return {
    syncScope,
    backfill,
    syncUsers,
    syncLeaf,
    syncLeaves,
    hydrate,
    unfilled: () => unfilled.size,
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
