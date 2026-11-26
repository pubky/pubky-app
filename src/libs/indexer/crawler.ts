import { chunks, mapLimit, sleep, throwIfAborted, timerSchedule, untilAborted, withDeadline } from './concurrency';
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
/** Waits after a 429 that names none: doubling from the first per consecutive 429 of a homeserver, up to the max. */
const RATE_LIMIT_FIRST_WAIT_MS = 1000;
const RATE_LIMIT_MAX_WAIT_MS = 8 * 1000;
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
  /** Homeservers failed or backing off, skipped for the rest of the operation. */
  failed: Set<string>;
}

const contextOf = (signal?: AbortSignal): OperationContext => ({
  signal,
  checked: new Set(),
  highWater: new Map(),
  windowStart: new Map(),
  failed: new Set(),
});

type Counter = 'lookups' | 'streamRequests' | 'bodyRequests' | 'events';

const headOf = (coverage: Coverage): Cursor | null =>
  coverage.length === 0 ? null : coverage[coverage.length - 1].head;

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
  const wait = params.sleep ?? sleep;
  const schedule = params.schedule ?? timerSchedule;
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
  let seedReach: CrawlerStats['seed'];
  let excluded: ReadonlySet<string> = new Set(options.excluded);
  const seen = new Set<string>();
  const failed = new Set<string>();
  /** Lookups in flight by user, so operations running together resolve a user once. */
  const lookups = new Map<string, Promise<string | null>>();
  /** Consecutive 429s per homeserver, across operations, until a request to it succeeds. */
  const rateLimited = new Map<string, number>();
  /** Records `hydrate` fetched once, by scope, path and cursor. */
  const hydrated = new Set<string>();
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
   * Runs a request to the homeserver, retrying it after a 429 up to `RATE_LIMIT_RETRIES` times, after the wait the
   * homeserver asked for or else one that grows with its consecutive 429s.
   */
  async function attempt<T>(ctx: OperationContext, homeserver: string, request: () => Promise<T>): Promise<T> {
    for (let retry = 0; ; retry += 1) {
      throwIfAborted(ctx.signal);
      try {
        const result = await request();
        rateLimited.delete(homeserver);
        return result;
      } catch (error) {
        throwIfAborted(ctx.signal);
        if (!(error instanceof RateLimitedError)) throw error;
        const streak = rateLimited.get(homeserver) ?? 0;
        rateLimited.set(homeserver, streak + 1);
        if (retry >= RATE_LIMIT_RETRIES) throw error;
        const fallback = Math.min(RATE_LIMIT_FIRST_WAIT_MS * 2 ** streak, RATE_LIMIT_MAX_WAIT_MS);
        await wait(error.retryAfterMs ?? fallback, ctx.signal);
      }
    }
  }

  /** One call to the homeserver under the request deadline; past it the homeserver counts as unreachable. */
  async function call<T>(ctx: OperationContext, homeserver: string, request: (signal: AbortSignal) => Promise<T>) {
    try {
      return await withDeadline(request, options.requestTimeoutMs, schedule, ctx.signal);
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
      if (error instanceof HomeserverUnreachableError || error instanceof InvalidIndexInputError) {
        const { failure } = await store.readHomeserverState(homeserver);
        const failures = (failure?.failures ?? 0) + 1;
        const delay = Math.min(BACKOFF_BASE_MS * 2 ** (failures - 1), BACKOFF_MAX_MS);
        await store.patchHomeserverState(homeserver, { failure: { failures, retryAt: now() + delay } });
      } else if (!(error instanceof RateLimitedError)) {
        throw error;
      }
      markFailed(ctx, homeserver);
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
    if (ctx.checked.has(homeserver)) return true;
    ctx.checked.add(homeserver);
    return guard(ctx, homeserver, () => detectRestore(ctx, homeserver, state.highWater));
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

  /** Sets `data` on the records of fresh runs that need their file. */
  async function attachBodies(ctx: OperationContext, runs: readonly Run<D>[]): Promise<void> {
    const records = runs.flatMap((run) =>
      run.entries.flatMap((entry) =>
        entry.kind === 'record' && domain.needsBody(entry.path)
          ? [{ homeserver: run.homeserver, author: run.author, record: entry }]
          : [],
      ),
    );
    await mapLimit(records, options.bodyConcurrency, async ({ homeserver, author, record }) => {
      const data = await bodyOf(ctx, homeserver, author, record);
      if (data !== null) record.data = data;
    });
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
    await commit(
      { applyRuns: runs, homeserverStates: [{ homeserver, patch: { highWater, failure: null } }] },
      { scopes, seeds: [] },
    );
  }

  /**
   * The highest cursor of a write older than the window, read backwards over the windowed paths one batch at a
   * time. Only a write dates its cursor: a delete of an old path can happen any time later. Zero when none has one:
   * the users' history is younger than the window.
   *
   * The cursor is the homeserver's, but the users only sample it: a seed whose last old post is a year old would set
   * a year-wide window for everyone after it. So the search goes on through the batches until a write within a tenth
   * of the window from its edge settles it, and only a settled start is kept for the homeserver; any other serves
   * this call alone, and the next call, with other users, searches again.
   */
  async function windowStartOf(ctx: OperationContext, homeserver: string, users: readonly string[]) {
    const known = ctx.windowStart.get(homeserver);
    if (known !== undefined) return known;
    const { windowStart } = await store.readHomeserverState(homeserver);
    if (windowStart !== null && now() - windowStart.foundAt < WINDOW_START_TTL_MS) {
      ctx.windowStart.set(homeserver, windowStart.cursor);
      return windowStart.cursor;
    }
    const windowMs = options.windowDays * DAY_MS;
    const microsBefore = (ms: number) => BigInt(Math.floor(now() - ms)) * MICROS_PER_MS;
    const cutoff = microsBefore(windowMs);
    const settled = microsBefore(windowMs + windowMs / 10);
    const olderThanWindow = (page: AuthoredStreamEvent[]) =>
      page.reduce<{ cursor: Cursor; time: bigint } | null>((found, event) => {
        const time = event.type === 'PUT' ? domain.timeOfPath(event.path) : null;
        const older = time !== null && time < cutoff;
        return older && (found === null || event.cursor > found.cursor) ? { cursor: event.cursor, time } : found;
      }, null);
    const read = reader(ctx, homeserver, windowPaths, options.pageLimit);
    let best: { cursor: Cursor; time: bigint } | null = null;
    for (const batch of chunks(users, options.batchSize)) {
      const found = await readBackward(batch, options.pageLimit, read, olderThanWindow);
      if (found !== null && (best === null || found.cursor > best.cursor)) best = found;
      if (best !== null && best.time >= settled) break;
    }
    if (best === null || best.time < settled) return best?.cursor ?? CURSOR_ZERO;
    await store.patchHomeserverState(homeserver, { windowStart: { cursor: best.cursor, foundAt: now() } });
    ctx.windowStart.set(homeserver, best.cursor);
    return best.cursor;
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

  async function syncWindow(ctx: OperationContext, homeserver: string, users: readonly string[]) {
    if (windowGroups.length === 0 || !(await ready(ctx, homeserver))) return;
    await guard(ctx, homeserver, async () => {
      const start = await windowStartOf(ctx, homeserver, users);
      const fromStart = (head: Cursor | null) => (head === null || head < start ? start : head);
      for (const group of windowGroups) await syncGroup(ctx, homeserver, group, users, fromStart);
    });
  }

  /** Runs `work` for every homeserver at once, so a slow one holds up none of the others; rethrows after all end. */
  async function eachHomeserver(
    byHomeserver: ReadonlyMap<string, string[]>,
    work: (homeserver: string, users: string[]) => Promise<void>,
  ) {
    const errors: unknown[] = [];
    await Promise.all(
      [...byHomeserver].map(([homeserver, users]) =>
        work(homeserver, users).catch((error: unknown) => {
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
    const ctx = contextOf(signal);
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
    for (let hop = 0; frontier.length > 0; hop += 1) {
      counters.usersPerHop.push(frontier.length);
      changed();
      const { homeserverOf, byHomeserver } = await resolving;
      await eachHomeserver(byHomeserver, (homeserver, users) => syncFull(ctx, homeserver, users));
      // The seed's profile and follows are enough for a first answer: it is a member before its activity is read.
      if (hop === 0) await publish(new Map([...before, ...members]), false);
      const next = hop < options.hops ? await nextHop(frontier, homeserverOf, members, hop + 1, skipped) : [];
      // Lookups go to the resolvers, not the homeservers: the next hop's run while this hop's activity is read.
      resolving = resolveAll(ctx, next);
      // Awaited at the next hop; when this one throws first, its rejection is dropped here.
      resolving.catch(() => undefined);
      await eachHomeserver(byHomeserver, (homeserver, users) => syncWindow(ctx, homeserver, users));
      if (hop === 0) {
        const homeserver = homeserverOf.get(seed) ?? null;
        seedReach = { homeserver, failed: homeserver !== null && ctx.failed.has(homeserver) };
        changed();
      }
      throwIfAborted(signal);
      // Each hop's members join the stored ones at once, so answers grow during a first sync; none leaves before
      // the sync ends.
      await publish(new Map([...before, ...members]), false);
      frontier = next;
    }
    throwIfAborted(signal);
    await publish(members, true);
    return { members, failedHomeservers: [...ctx.failed] };
  }

  async function syncUsers(users: readonly string[], signal?: AbortSignal): Promise<SyncOutcome> {
    const ctx = contextOf(signal);
    const { byHomeserver } = await resolveAll(ctx, [...new Set(users)]);
    await eachHomeserver(byHomeserver, (homeserver, batch) => syncFull(ctx, homeserver, batch));
    await eachHomeserver(byHomeserver, (homeserver, batch) => syncWindow(ctx, homeserver, batch));
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

  async function backfill(author: string, groupId: string, pages: number, signal?: AbortSignal) {
    const group = domain.groups.find(({ id }) => id === groupId);
    if (group === undefined) throw new InvalidIndexInputError(`unknown group ${groupId}`);
    const ctx = contextOf(signal);
    const homeserver = (await store.readUserHomeserver(author))?.homeserver ?? null;
    if (homeserver === null) return { tail: null, pages: 0, events: 0 };
    const scope = { author, homeserver, group: group.id };
    const limit = options.backfillPageLimit;
    const read = reader(ctx, homeserver, group.paths, limit);
    let events = 0;
    for (let done = 0; ; done += 1) {
      // Re-read each time: the new run may join a lower stored range, and reading resumes below it.
      const coverage = await store.readCoverage(scope);
      const trusted = coverage.length === 0 ? null : coverage[coverage.length - 1];
      const stored = trusted === null ? null : trusted.tail;
      if (done >= pages || stored === CURSOR_ZERO) return { tail: stored, pages: done, events };
      // The tail itself is outside the range, so read from one above it. A window that held none of the author's
      // events stored no range at all: then the read starts at their newest event.
      const page = await read([{ user: author, cursor: stored === null ? null : stored + ONE }], true);
      if (stored === null && page.length === 0) return { tail: null, pages: done, events };
      const lowest = page.reduce<Cursor | null>(
        (low, event) => (low === null || event.cursor < low ? event.cursor : low),
        null,
      );
      const highest = page.reduce((high, event) => (event.cursor > high ? event.cursor : high), CURSOR_ZERO);
      // A full page holds every event down to its lowest cursor; a shorter one reached the stream start.
      const tail = page.length >= limit && lowest !== null ? lowest - ONE : CURSOR_ZERO;
      const run = foldEvents<D>(scope, tail, stored ?? highest, page);
      await attachBodies(ctx, [run]);
      await commit({ applyRuns: [run] }, { scopes: [scopeOf(run)], seeds: [] });
      events += page.length;
    }
  }

  async function hydrate(seed: string, limit = Infinity, signal?: AbortSignal): Promise<HydrateResult> {
    const ctx = contextOf(signal);
    const members = await store.readScopeMembers(seed);
    const users = new Set([seed, ...members.keys()]);
    const missing: Array<{ scope: ScopeKey; record: RecordEntry<D>; key: string }> = [];
    for (const user of users) {
      throwIfAborted(signal);
      const homeserver = (await store.readUserHomeserver(user))?.homeserver ?? null;
      if (homeserver === null) continue;
      for (const group of domain.groups) {
        const scope = { author: user, homeserver, group: group.id };
        const { live } = await store.readScope(scope);
        for (const record of live.values()) {
          const key = `${scopeId(scope)}\u0000${record.path}\u0000${record.cursor}`;
          if (record.data !== undefined || !domain.needsBody(record.path) || hydrated.has(key)) continue;
          missing.push({ scope, record, key });
        }
      }
    }
    missing.sort((a, b) => (a.record.cursor > b.record.cursor ? -1 : a.record.cursor < b.record.cursor ? 1 : 0));
    const chosen = missing.slice(0, limit);
    const byHomeserver = new Map<string, typeof chosen>();
    for (const item of chosen) {
      byHomeserver.set(item.scope.homeserver, [...(byHomeserver.get(item.scope.homeserver) ?? []), item]);
    }
    let fetched = 0;
    let tried = 0;
    for (const [homeserver, items] of byHomeserver) {
      if (ctx.failed.has(homeserver)) continue;
      const { failure } = await store.readHomeserverState(homeserver);
      if (failure !== null && failure.retryAt > now()) {
        markFailed(ctx, homeserver);
        continue;
      }
      // A failing homeserver leaves its records untried, for a later call.
      await guard(ctx, homeserver, async () => {
        const runs: Run<D>[] = [];
        await mapLimit(items, options.bodyConcurrency, async ({ scope, record }) => {
          const data = await bodyOf(ctx, scope.homeserver, scope.author, record);
          if (data === null) return;
          // The one event at this cursor: a run of it alone lies inside the stored coverage and changes no range.
          runs.push({
            ...scopeOf(scope),
            tail: record.cursor - ONE,
            head: record.cursor,
            entries: [{ ...record, data }],
          });
        });
        if (runs.length > 0) await commit({ applyRuns: runs }, { scopes: runs.map(scopeOf), seeds: [] });
        for (const { key } of items) hydrated.add(key);
        fetched += runs.length;
        tried += items.length;
      });
    }
    return { fetched, remaining: missing.length - tried };
  }

  return {
    syncScope,
    backfill,
    syncUsers,
    syncLeaf,
    syncLeaves,
    hydrate,
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
