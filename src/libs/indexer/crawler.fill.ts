import { throwIfAborted } from './concurrency';
import { contextOf, type OperationContext } from './crawler.context';
import type { Requests } from './crawler.request';
import type { CrawlerOptions, HydrateResult, StoreChange } from './crawler.types';
import type { Domain } from './domain.types';
import { createHeap, type Heap } from './heap';
import type { Entry, RecordEntry } from './indexer.types';
import { scopeId, scopeOf } from './store.helpers';
import type { IndexStore, ScopeKey, StoreBatch } from './store.types';

/** A record stored without the file it needs, with the epoch of the read that stored it. */
interface Unfilled<D> {
  scope: ScopeKey;
  record: RecordEntry<D>;
  epoch: number;
}

export interface FillDeps<D> {
  store: IndexStore<D>;
  domain: Domain<D>;
  now: () => number;
  options: CrawlerOptions;
  requests: Requests<D>;
  markFailed: (ctx: OperationContext, homeserver: string) => void;
  commit: (batch: StoreBatch<D>, change: StoreChange) => Promise<void>;
}

/** The records stored without their files, and the fill that fetches them. */
export interface Fill<D> {
  /** Takes in what a commit of fresh runs left without its files. */
  noteRuns(batch: StoreBatch<D>): void;
  hydrate(scopes?: Iterable<ScopeKey>, signal?: AbortSignal): Promise<HydrateResult>;
  unfilled(): number;
  forgetUnfilled(scopes: readonly ScopeKey[]): void;
  dropUnfilled(keep: (scope: ScopeKey) => boolean): void;
}

export function createFill<D>(deps: FillDeps<D>): Fill<D> {
  const { store, domain, now, options, markFailed, commit } = deps;
  const { guard, bodyOf } = deps.requests;

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

  /** Takes in what a commit of fresh runs left without its files. */
  function noteRuns(batch: StoreBatch<D>): void {
    for (const run of batch.applyRuns ?? []) {
      const epoch = batch.readAt?.find(({ homeserver }) => homeserver === run.homeserver)?.epoch ?? 0;
      for (const entry of run.entries) {
        const needs = domain.needsBody(entry.path);
        if (needs !== null) noteEntry(run, entry, epoch, needs === 'later');
      }
    }
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

  return { noteRuns, hydrate, unfilled: () => unfilledCount, forgetUnfilled, dropUnfilled };
}
