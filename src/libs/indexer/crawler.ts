import { chunks, mapLimit, sleep, throwIfAborted } from './concurrency';
import {
  type Crawler,
  type CrawlerParams,
  type CrawlerStats,
  DEFAULT_CRAWLER_OPTIONS,
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
} from './indexer.errors';
import type { Cursor, Range, RecordEntry, Run } from './indexer.types';
import { compactRuns, mergeRuns } from './merge';
import { readBackward, readForward, type ReadPage } from './paging';
import { foldEvents } from './run';
import type { HighWater, ScopeKey } from './store.types';
import type { AuthoredStreamEvent } from './transport.types';

const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_START_TTL_MS = DAY_MS;
const BACKOFF_BASE_MS = 60 * 1000;
const BACKOFF_MAX_MS = 30 * 60 * 1000;
const RATE_LIMIT_WAIT_MS = 5 * 1000;
const RATE_LIMIT_RETRIES = 3;
const MICROS_PER_MS = BigInt(1000);
const ONE = BigInt(1);

/** What one operation learned about homeservers, so each is checked once per operation. */
interface OperationContext {
  signal?: AbortSignal;
  /** Homeservers already checked for a restore. */
  checked: Set<string>;
  highWater: Map<string, HighWater | null>;
  windowStart: Map<string, Cursor>;
}

type Counter = 'lookups' | 'streamRequests' | 'bodyRequests' | 'events';

const headOf = (runs: readonly Range[]): Cursor | null =>
  runs.reduce<Cursor | null>((head, run) => (head === null || run.head > head ? run.head : head), null);

const newestOf = (current: HighWater | null, event: AuthoredStreamEvent | null): HighWater | null =>
  event !== null && (current === null || event.cursor > current.cursor)
    ? { cursor: event.cursor, author: event.author }
    : current;

export function createCrawler<D>(params: CrawlerParams<D>): Crawler {
  const { transport, store, domain, now } = params;
  const wait = params.sleep ?? sleep;
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

  const counters = { usersPerHop: [] as number[], lookups: 0, streamRequests: 0, bodyRequests: 0, events: 0 };
  const seen = new Set<string>();
  const failed = new Set<string>();
  const listeners = new Set<(stats: CrawlerStats) => void>();

  const stats = (): CrawlerStats => ({
    usersPerHop: [...counters.usersPerHop],
    homeserversSeen: seen.size,
    homeserversFailed: failed.size,
    lookups: counters.lookups,
    streamRequests: counters.streamRequests,
    bodyRequests: counters.bodyRequests,
    events: counters.events,
  });
  const changed = () => {
    const snapshot = stats();
    for (const listener of listeners) listener(snapshot);
  };
  const count = (counter: Counter, by = 1) => {
    counters[counter] += by;
    changed();
  };

  /** Runs a request, retrying it after a 429 up to `RATE_LIMIT_RETRIES` times. */
  async function attempt<T>(ctx: OperationContext, request: () => Promise<T>): Promise<T> {
    for (let retry = 0; ; retry += 1) {
      throwIfAborted(ctx.signal);
      try {
        return await request();
      } catch (error) {
        throwIfAborted(ctx.signal);
        if (!(error instanceof RateLimitedError) || retry >= RATE_LIMIT_RETRIES) throw error;
        await wait(error.retryAfterMs ?? RATE_LIMIT_WAIT_MS, ctx.signal);
      }
    }
  }

  function reader(ctx: OperationContext, homeserver: string, paths: string[], limit: number): ReadPage {
    return async (users, reverse) => {
      const events = await attempt(ctx, () => {
        count('streamRequests');
        return transport.readEvents({ homeserver, users, paths, limit, reverse, signal: ctx.signal });
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
      if (error instanceof HomeserverUnreachableError || error instanceof InvalidIndexInputError) {
        const { failure } = await store.readHomeserverState(homeserver);
        const failures = (failure?.failures ?? 0) + 1;
        const delay = Math.min(BACKOFF_BASE_MS * 2 ** (failures - 1), BACKOFF_MAX_MS);
        await store.patchHomeserverState(homeserver, { failure: { failures, retryAt: now() + delay } });
      } else if (!(error instanceof RateLimitedError)) {
        throw error;
      }
      failed.add(homeserver);
      changed();
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
    await store.commit({
      deleteHomeservers: [homeserver],
      homeserverStates: [{ homeserver, patch: { highWater: null, windowStart: null } }],
    });
    ctx.highWater.set(homeserver, null);
    ctx.windowStart.delete(homeserver);
  }

  /** Whether the homeserver may be crawled now: not failed, not backing off, checked for a restore. */
  async function ready(ctx: OperationContext, homeserver: string): Promise<boolean> {
    if (failed.has(homeserver)) return false;
    const state = await store.readHomeserverState(homeserver);
    if (state.failure !== null && state.failure.retryAt > now()) {
      failed.add(homeserver);
      changed();
      return false;
    }
    if (ctx.checked.has(homeserver)) return true;
    ctx.checked.add(homeserver);
    return guard(ctx, homeserver, () => detectRestore(ctx, homeserver, state.highWater));
  }

  /** The stored runs of each user in the group, in batch order. */
  async function storedRuns(homeserver: string, group: PathGroup, users: readonly string[]) {
    const stored = new Map<string, Run<D>[]>();
    for (const user of users) stored.set(user, await store.readRuns({ author: user, homeserver, group: group.id }));
    return stored;
  }

  async function bodyOf(ctx: OperationContext, author: string, record: RecordEntry<D>): Promise<D | null> {
    const bytes = await attempt(ctx, () => {
      count('bodyRequests');
      return transport.getPublic({ author, path: record.path, signal: ctx.signal });
    });
    // A 404 or other bytes mean a later event replaced this one, and that event brings the data.
    if (bytes === null) return null;
    if (record.hash !== undefined && domain.matchesHash !== undefined && !domain.matchesHash(bytes, record.hash)) {
      return null;
    }
    return domain.reduce(author, record.path, bytes);
  }

  /** Sets `data` on the records of fresh runs that need their file. */
  async function attachBodies(ctx: OperationContext, runs: readonly Run<D>[]): Promise<void> {
    const records = runs.flatMap((run) =>
      run.entries.flatMap((entry) =>
        entry.kind === 'record' && domain.needsBody(entry.path) ? [{ author: run.author, record: entry }] : [],
      ),
    );
    await mapLimit(records, options.bodyConcurrency, async ({ author, record }) => {
      const data = await bodyOf(ctx, author, record);
      if (data !== null) record.data = data;
    });
  }

  /**
   * Reads one batch forward from its tails and commits, with the new high water, each user that moved: its
   * stored runs compacted with the new one, so a scope keeps one run per contiguous range instead of one more
   * run per sync.
   */
  async function crawlBatch(
    ctx: OperationContext,
    homeserver: string,
    group: PathGroup,
    tails: Map<string, Cursor>,
    stored: ReadonlyMap<string, Run<D>[]>,
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
    const replaceRuns = runs.map((run) => {
      const scope: ScopeKey = { author: run.author, homeserver, group: group.id };
      return { scope, runs: compactRuns([...(stored.get(run.author) ?? []), run]) };
    });
    const highWater = newestOf(ctx.highWater.get(homeserver) ?? null, newest);
    await store.commit({
      replaceRuns,
      homeserverStates: [{ homeserver, patch: { highWater, failure: null } }],
    });
    ctx.highWater.set(homeserver, highWater);
  }

  /**
   * The highest cursor of an event older than the window, read backwards over the windowed paths one batch at a
   * time. Zero when none has one: the homeserver's history is younger than the window.
   */
  async function windowStartOf(ctx: OperationContext, homeserver: string, users: readonly string[]) {
    const known = ctx.windowStart.get(homeserver);
    if (known !== undefined) return known;
    const { windowStart } = await store.readHomeserverState(homeserver);
    let cursor = windowStart !== null && now() - windowStart.foundAt < WINDOW_START_TTL_MS ? windowStart.cursor : null;
    if (cursor === null) {
      const cutoff = BigInt(Math.floor(now() - options.windowDays * DAY_MS)) * MICROS_PER_MS;
      const olderThanWindow = (page: AuthoredStreamEvent[]) =>
        page.reduce<Cursor | null>((found, event) => {
          const time = domain.timeOfPath(event.path);
          const older = time !== null && time < cutoff;
          return older && (found === null || event.cursor > found) ? event.cursor : found;
        }, null);
      const read = reader(ctx, homeserver, windowPaths, options.pageLimit);
      for (const batch of chunks(users, options.batchSize)) {
        cursor = await readBackward(batch, options.pageLimit, read, olderThanWindow);
        if (cursor !== null) break;
      }
      cursor = cursor ?? CURSOR_ZERO;
      await store.patchHomeserverState(homeserver, { windowStart: { cursor, foundAt: now() } });
    }
    ctx.windowStart.set(homeserver, cursor);
    return cursor;
  }

  async function syncFull(ctx: OperationContext, homeserver: string, users: readonly string[]) {
    if (!(await ready(ctx, homeserver))) return;
    await guard(ctx, homeserver, async () => {
      for (const group of fullGroups) {
        for (const batch of chunks(users, options.batchSize)) {
          const stored = await storedRuns(homeserver, group, batch);
          const tails = new Map<string, Cursor>();
          for (const [user, runs] of stored) tails.set(user, headOf(runs) ?? CURSOR_ZERO);
          await crawlBatch(ctx, homeserver, group, tails, stored);
        }
      }
    });
  }

  async function syncWindow(ctx: OperationContext, homeserver: string, users: readonly string[]) {
    if (windowGroups.length === 0 || !(await ready(ctx, homeserver))) return;
    await guard(ctx, homeserver, async () => {
      const start = await windowStartOf(ctx, homeserver, users);
      for (const group of windowGroups) {
        for (const batch of chunks(users, options.batchSize)) {
          const stored = await storedRuns(homeserver, group, batch);
          const tails = new Map<string, Cursor>();
          for (const [user, runs] of stored) {
            const head = headOf(runs);
            tails.set(user, head === null || head < start ? start : head);
          }
          await crawlBatch(ctx, homeserver, group, tails, stored);
        }
      }
    });
  }

  /** The user's homeserver from the store while fresh, else from the transport; a failed lookup keeps the old. */
  async function resolve(ctx: OperationContext, user: string): Promise<string | null> {
    throwIfAborted(ctx.signal);
    const cached = await store.readUserHomeserver(user);
    if (cached !== null && now() - cached.resolvedAt < options.homeserverTtlMs) return cached.homeserver;
    count('lookups');
    let homeserver: string | null;
    try {
      homeserver = await transport.resolveHomeserver(user);
    } catch (error) {
      throwIfAborted(ctx.signal);
      if (!(error instanceof IndexerError)) throw error;
      return cached?.homeserver ?? null;
    }
    await store.writeUserHomeserver(user, { homeserver, resolvedAt: now() });
    return homeserver;
  }

  /** Users the frontier links to that are not in scope yet, added to `members` until the cap. */
  async function nextHop(
    frontier: readonly string[],
    homeserverOf: ReadonlyMap<string, string | null>,
    members: Map<string, number>,
    hop: number,
  ): Promise<string[]> {
    const next: string[] = [];
    for (const user of frontier) {
      const homeserver = homeserverOf.get(user) ?? null;
      if (homeserver === null) continue;
      const { live } = mergeRuns(await store.readRuns({ author: user, homeserver, group: scopeGroupId }));
      for (const link of domain.linksOf(live)) {
        if (members.size >= options.maxUsers) return next;
        if (members.has(link) || options.excluded.has(link)) continue;
        members.set(link, hop);
        next.push(link);
      }
    }
    return next;
  }

  async function syncScope(seed: string, signal?: AbortSignal): Promise<SyncResult> {
    const ctx: OperationContext = { signal, checked: new Set(), highWater: new Map(), windowStart: new Map() };
    Object.assign(counters, { usersPerHop: [], lookups: 0, streamRequests: 0, bodyRequests: 0, events: 0 });
    seen.clear();
    failed.clear();
    changed();

    const members = new Map([[seed, 0]]);
    let frontier = [seed];
    for (let hop = 0; frontier.length > 0; hop += 1) {
      counters.usersPerHop.push(frontier.length);
      changed();
      const resolved = await mapLimit(frontier, options.lookupConcurrency, (user) => resolve(ctx, user));
      const homeserverOf = new Map(frontier.map((user, i): [string, string | null] => [user, resolved[i]]));
      const byHomeserver = new Map<string, string[]>();
      for (const [user, homeserver] of homeserverOf) {
        if (homeserver === null) continue;
        seen.add(homeserver);
        byHomeserver.set(homeserver, [...(byHomeserver.get(homeserver) ?? []), user]);
      }
      changed();

      for (const [homeserver, users] of byHomeserver) await syncFull(ctx, homeserver, users);
      const next = hop < options.hops ? await nextHop(frontier, homeserverOf, members, hop + 1) : [];
      for (const [homeserver, users] of byHomeserver) await syncWindow(ctx, homeserver, users);
      frontier = next;
    }
    throwIfAborted(signal);
    await store.writeScopeMembers(seed, members);
    return { members, failedHomeservers: [...failed] };
  }

  async function backfill(author: string, groupId: string, pages: number, signal?: AbortSignal) {
    const group = domain.groups.find(({ id }) => id === groupId);
    if (group === undefined) throw new InvalidIndexInputError(`unknown group ${groupId}`);
    const ctx: OperationContext = { signal, checked: new Set(), highWater: new Map(), windowStart: new Map() };
    const homeserver = (await store.readUserHomeserver(author))?.homeserver ?? null;
    if (homeserver === null) return { tail: null, pages: 0 };
    const scope = { author, homeserver, group: group.id };
    const read = reader(ctx, homeserver, group.paths, options.pageLimit);
    for (let done = 0; ; done += 1) {
      // Re-merge each time: the new run may join a lower stored range, and reading resumes below it.
      const stored = await store.readRuns(scope);
      const { trusted } = mergeRuns(stored);
      if (trusted === null) return { tail: null, pages: done };
      if (done >= pages || trusted.tail === CURSOR_ZERO) return { tail: trusted.tail, pages: done };
      // The tail itself is outside the range, so read from one above it.
      const page = await read([{ user: author, cursor: trusted.tail + ONE }], true);
      const lowest = page.reduce<Cursor | null>(
        (low, event) => (low === null || event.cursor < low ? event.cursor : low),
        null,
      );
      const tail = page.length >= options.pageLimit && lowest !== null ? lowest - ONE : CURSOR_ZERO;
      const run = foldEvents<D>(scope, tail, trusted.tail, page);
      await attachBodies(ctx, [run]);
      await store.replaceRuns(scope, compactRuns([...stored, run]));
    }
  }

  return {
    syncScope,
    backfill,
    stats,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
