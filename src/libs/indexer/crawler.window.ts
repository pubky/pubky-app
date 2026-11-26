import { chunks, mapLimit } from './concurrency';
import {
  fromHead,
  headOf,
  highestOf,
  lowestOf,
  ONE,
  type OperationContext,
  readStateOf,
  topTailOf,
} from './crawler.context';
import type { Requests } from './crawler.request';
import type { CrawlerOptions, StoreChange } from './crawler.types';
import { CURSOR_ZERO } from './cursor';
import type { Domain, PathGroup } from './domain.types';
import type { Cursor, Run } from './indexer.types';
import { foldEvents } from './run';
import { scopeOf } from './store.helpers';
import type { IndexStore, ScopeKey, StoreBatch } from './store.types';
import { buildTimeTable, cursorAt, estimateMs, type TimeSample } from './timeTable';
import type { AuthoredStreamEvent } from './transport.types';

const DAY_MS = 24 * 60 * 60 * 1000;

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

/** How a newest-first read goes: events per page, pages per batch, the cursor every user stops at, paths per user. */
interface NewestFirstPlan {
  limit: number;
  pages: number;
  cutoff: () => Cursor | null;
  maxPaths: number;
}

/** Users' events to commit newest first, each user's in their range `(tail, top]`. */
interface Below {
  ranges: ReadonlyMap<string, { top: Cursor; tail: Cursor }>;
  events: readonly AuthoredStreamEvent[];
}

export interface WindowDeps<D> {
  store: IndexStore<D>;
  domain: Domain<D>;
  now: () => number;
  options: CrawlerOptions;
  requests: Requests<D>;
  windowGroups: readonly PathGroup[];
  ready: (ctx: OperationContext, homeserver: string) => Promise<boolean>;
  syncGroup: (
    ctx: OperationContext,
    homeserver: string,
    group: PathGroup,
    users: readonly string[],
    tailOf: (head: Cursor | null) => Cursor,
  ) => Promise<void>;
  commitRuns: (batch: StoreBatch<D>, change: StoreChange) => Promise<void>;
}

/** The windowed groups' reads: newest first off the homeserver's clock, or a slice at a time. */
export interface WindowReads {
  syncWindow(ctx: OperationContext, homeserver: string, users: readonly string[]): Promise<void>;
  syncNewest(ctx: OperationContext, homeserver: string, users: readonly string[]): Promise<void>;
  readSlice(ctx: OperationContext, scope: ScopeKey, group: PathGroup, below: Cursor | null): Promise<number>;
}

export function createWindowReads<D>(deps: WindowDeps<D>): WindowReads {
  const { store, domain, now, options, windowGroups, ready, syncGroup, commitRuns } = deps;
  const { reader, guard, bodyOf, attachBodies } = deps.requests;
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
        await readNewestFirst(ctx, homeserver, group, below, {
          limit: options.pageLimit,
          pages: Infinity,
          cutoff: () => cutoffOf(ctx, homeserver),
          maxPaths: options.windowMaxEntries,
        });
      }
    });
  }

  /**
   * Reads the users' group newest first from each one's top down to where their read stops: the plan's cutoff, once
   * it places one, their floor, their `maxPaths`-th path, the plan's last page or their stream start. A window's cutoff
   * comes from the homeserver's clock, to which every page read adds its dated writes, shared by every batch of the
   * homeserver: until the clock holds a write older than the window, a batch keeps reading. The batches commit as one
   * stream, newest events first: a round commits what every batch has read, everything above the highest point a
   * batch still reading has reached, while that batch reads its next page. The events read.
   */
  async function readNewestFirst(
    ctx: OperationContext,
    homeserver: string,
    group: PathGroup,
    bounds: ReadonlyMap<string, WindowBound>,
    plan: NewestFirstPlan,
  ): Promise<number> {
    if (bounds.size === 0) return 0;
    const { limit } = plan;
    const read = reader(ctx, homeserver, group.paths, limit);
    let taken = 0;
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
      /** Pages read. */
      pages: number;
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
      const cutoff = plan.cutoff();
      for (const user of [...batch.reading]) {
        const stop = stopOf(user, cutoff);
        if (stop !== null && batch.low <= stop) end(batch, user, stop);
      }
    };
    /** Takes in a page of the users still reading. A full page holds all their events down to its lowest cursor. */
    const take = (batch: Batch, page: readonly AuthoredStreamEvent[]) => {
      taken += page.length;
      batch.pages += 1;
      const cutoff = plan.cutoff();
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
          if ((bounds.get(user)?.held ?? 0) + paths.size >= plan.maxPaths) {
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
      // The stream start, or the plan's last page: whoever is still reading stops at what this page reached.
      if (batch.low === CURSOR_ZERO || batch.pages >= plan.pages) {
        for (const user of [...batch.reading]) end(batch, user, batch.low);
      }
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
        pages: 0,
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
    return taken;
  }

  /**
   * Commits backwards reads of one homeserver as one stream: their events in slices of `sliceLimit`, newest
   * first. A slice commits once its files to render and every newer slice are in, so the top range only grows
   * downwards and a failure keeps every slice above it; the files of all slices are fetched together.
   */
  async function commitBelow(ctx: OperationContext, homeserver: string, group: PathGroup, parts: readonly Below[]) {
    const newestFirst = parts.flatMap(({ events }) => events).sort((a, b) => (a.cursor > b.cursor ? -1 : 1));
    const slices: Run<D>[][] = [];
    let high: Cursor | null = null;
    for (let i = 0; i === 0 || i < newestFirst.length; i += options.sliceLimit) {
      const slice = newestFirst.slice(i, i + options.sliceLimit);
      const last = i + options.sliceLimit >= newestFirst.length;
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
          if (!(await catchUp(ctx, scope, group))) await readSlice(ctx, scope, group, null);
        }
      }
    });
  }

  /**
   * Reads one page of `sliceLimit` events forward from the scope's head and commits it when it is not full,
   * the scope then holding everything up to the newest event. False, with nothing committed, for a scope with no
   * history or one more than a page behind.
   */
  async function catchUp(ctx: OperationContext, scope: ScopeKey, group: PathGroup): Promise<boolean> {
    const head = headOf(await store.readCoverage(scope));
    if (head === null) return false;
    const limit = options.sliceLimit;
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

  /**
   * Reads the slice of `sliceLimit` events below `below`, a tail of the scope, or the newest slice when `null`, fetches
   * the files it needs to render and commits it: the newest-first read of one user for one page, with no cutoff. Its
   * events.
   */
  const readSlice = (ctx: OperationContext, scope: ScopeKey, group: PathGroup, below: Cursor | null) =>
    readNewestFirst(ctx, scope.homeserver, group, new Map([[scope.author, { top: below, floor: null, held: 0 }]]), {
      limit: options.sliceLimit,
      pages: 1,
      cutoff: () => null,
      maxPaths: Infinity,
    });

  return { syncWindow, syncNewest, readSlice };
}
