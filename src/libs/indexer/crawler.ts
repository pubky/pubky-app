import {
  chunks,
  createRequestGate,
  mapLimit,
  sleep,
  throwIfAborted,
  timerSchedule,
  untilAborted,
  withDeadline,
} from './concurrency';
import {
  contextOf,
  type Counter,
  fromHead,
  headOf,
  type OperationContext,
  readAtOf,
  readStateOf,
  topTailOf,
} from './crawler.context';
import { createFill } from './crawler.fill';
import { createRequests } from './crawler.request';
import {
  type Crawler,
  type CrawlerParams,
  type CrawlerStats,
  DEFAULT_CRAWLER_OPTIONS,
  type LeafRequest,
  type LeavesOutcome,
  type StoreChange,
  type SyncOutcome,
  type SyncResult,
} from './crawler.types';
import { createWindowReads } from './crawler.window';
import { CURSOR_ZERO } from './cursor';
import type { PathGroup } from './domain.types';
import { IndexerError, InvalidIndexInputError } from './indexer.errors';
import type { Cursor, Run } from './indexer.types';
import { readForward } from './paging';
import { foldEvents } from './run';
import { scopeOf } from './store.helpers';
import type { HighWater, StoreBatch } from './store.types';

/** A run changes what is served when it brings entries or does not extend the stored top range. */
const changesServed = (run: Run<unknown>, storedHead: Cursor | null): boolean =>
  run.entries.length > 0 || (storedHead !== null && run.tail !== storedHead);

const sameMembers = (a: ReadonlyMap<string, number>, b: ReadonlyMap<string, number>): boolean =>
  a.size === b.size && [...b].every(([user, hop]) => a.get(user) === hop);

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
  const gate = createRequestGate(options.homeserverConcurrency, { now, sleep: (ms) => wait(ms) });
  const counters = { usersPerHop: [] as number[], lookups: 0, streamRequests: 0, bodyRequests: 0, events: 0 };
  let seedReach: CrawlerStats['seed'];
  let excluded: ReadonlySet<string> = new Set(options.excluded);
  const seen = new Set<string>();
  const failed = new Set<string>();
  /** Lookups in flight by user, so operations running together resolve a user once. */
  const lookups = new Map<string, Promise<string | null>>();
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

  const requests = createRequests<D>({
    transport,
    store,
    domain,
    now,
    wait,
    schedule,
    options,
    gate,
    count,
    markFailed,
  });
  const { reader, guard, attachBodies } = requests;
  const fill = createFill<D>({ store, domain, now, options, requests, markFailed, commit });
  const { syncWindow, syncNewest, readSlice } = createWindowReads<D>({
    store,
    domain,
    now,
    options,
    requests,
    windowGroups,
    ready,
    syncGroup,
    commitRuns,
  });

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
    fill.dropUnfilled((scope) => scope.homeserver !== homeserver);
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

  /** Commits fresh runs and leaves the files of their `later` records to the fill. */
  async function commitRuns(batch: StoreBatch<D>, change: StoreChange): Promise<void> {
    await commit(batch, change);
    fill.noteRuns(batch);
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

  async function syncFull(ctx: OperationContext, homeserver: string, users: readonly string[]) {
    if (!(await ready(ctx, homeserver))) return;
    await guard(ctx, homeserver, async () => {
      for (const group of fullGroups) await syncGroup(ctx, homeserver, group, users, fromHead);
    });
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
      const read = await readSlice(ctx, scope, group, tail);
      // An empty newest slice: the author has no event in the group.
      if (tail === null && read === 0) break;
      events += read;
    }
    return { tail: topTailOf(await store.readCoverage(scope)), pages: done, events };
  }

  return {
    syncScope,
    backfill,
    syncUsers,
    syncLeaf,
    syncLeaves,
    hydrate: fill.hydrate,
    unfilled: fill.unfilled,
    forgetUnfilled: fill.forgetUnfilled,
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
