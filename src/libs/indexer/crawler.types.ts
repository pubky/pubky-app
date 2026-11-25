import type { Domain } from './domain.types';
import type { Cursor } from './indexer.types';
import type { IndexStore, ScopeKey } from './store.types';
import type { IndexerTransport } from './transport.types';

export interface CrawlerOptions {
  /** Link distance from the seed still in scope. */
  hops: number;
  /** Users per stream request; a homeserver takes at most 50. */
  batchSize: number;
  /** Events per stream request, for the whole batch; a homeserver takes at most 1000. */
  pageLimit: number;
  lookupConcurrency: number;
  bodyConcurrency: number;
  /** Age of the oldest events a windowed group indexes before a backfill. */
  windowDays: number;
  /** How long a resolved homeserver is used before resolving the user again. */
  homeserverTtlMs: number;
  /** Most users in a scope, seed included; nearer hops win. */
  maxUsers: number;
  /** Users left out of every scope, and with them whoever is reached only through them. */
  excluded: ReadonlySet<string>;
}

export const DEFAULT_CRAWLER_OPTIONS: Readonly<CrawlerOptions> = Object.freeze({
  hops: 2,
  batchSize: 50,
  pageLimit: 1000,
  lookupConcurrency: 8,
  bodyConcurrency: 16,
  windowDays: 30,
  homeserverTtlMs: 6 * 60 * 60 * 1000,
  maxUsers: 2000,
  excluded: new Set<string>(),
});

export interface CrawlerParams<D> {
  transport: IndexerTransport;
  store: IndexStore<D>;
  domain: Domain<D>;
  /** Wall clock in ms, injected so tests control time. */
  now: () => number;
  /** Waits before retrying a rate-limited request; a timer by default. Rejects with `IndexerAbortedError` on abort. */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  options?: Partial<CrawlerOptions>;
}

/** Counters since the last `syncScope` started, the operations after it included. */
export interface CrawlerStats {
  /** Users in scope per hop. */
  usersPerHop: number[];
  homeserversSeen: number;
  /** Homeservers that failed or were skipped while backing off. */
  homeserversFailed: number;
  lookups: number;
  streamRequests: number;
  bodyRequests: number;
  events: number;
  /**
   * The seed's homeserver as the last scope sync reached it, absent until that sync is past the seed: `null` when it
   * did not resolve, and `failed` when it could not be read.
   */
  seed?: { homeserver: string | null; failed: boolean };
}

export interface SyncOutcome {
  /** Homeservers that failed or were skipped while backing off; their users keep what was stored before. */
  failedHomeservers: string[];
}

export interface LeavesOutcome extends SyncOutcome {
  /** Per leaf, in the order given: the error that refused it, `null` for one that was synced. */
  refused: (Error | null)[];
}

export interface SyncResult extends SyncOutcome {
  /** Every user in scope, with its hop. */
  members: Map<string, number>;
}

/**
 * Some path prefixes of one author, crawled on demand into a scope of their own with full history. The prefixes
 * must lie inside the domain's paths, and a group id must keep the same prefixes on every call.
 */
export interface LeafRequest {
  author: string;
  /** Any id but one of the domain's groups. */
  group: string;
  paths: string[];
}

/** What one store commit changed. */
export interface StoreChange {
  /** Scopes whose served records may differ. */
  scopes: ScopeKey[];
  /** Seeds whose scope members changed. */
  seeds: string[];
  /** Scopes deleted whole because nothing needs them any longer (`forget`), also listed in `scopes`. */
  forgotten?: ScopeKey[];
}

export interface HydrateResult {
  /** Records that got their data. */
  fetched: number;
  /** Records still missing their data and not tried yet: beyond the limit or on a failing homeserver. */
  remaining: number;
}

export interface BackfillResult {
  /** The tail of the top contiguous coverage afterwards, `null` when the scope has none. */
  tail: Cursor | null;
  pages: number;
}

/**
 * Crawls scopes into the store. Run one operation at a time: they share the counters. An aborted operation
 * rejects with `IndexerAbortedError`, and everything it committed before stays valid.
 */
export interface Crawler {
  syncScope(seed: string, signal?: AbortSignal): Promise<SyncResult>;
  /** Extends the author's top contiguous coverage of the group backwards by up to `pages` stream pages. */
  backfill(author: string, groupId: string, pages: number, signal?: AbortSignal): Promise<BackfillResult>;
  /** Syncs the domain's groups of these users alone: the scope members stay and no link is followed. */
  syncUsers(users: readonly string[], signal?: AbortSignal): Promise<SyncOutcome>;
  /** Syncs a leaf scope from its stored head, or from the stream start. */
  syncLeaf(leaf: LeafRequest, signal?: AbortSignal): Promise<SyncOutcome>;
  /**
   * Syncs several leaf scopes as one operation: each author is resolved once, each homeserver checked once, and the
   * leaves are read concurrently. A leaf with invalid paths is refused alone.
   */
  syncLeaves(leaves: readonly LeafRequest[], signal?: AbortSignal): Promise<LeavesOutcome>;
  /**
   * Fetches the files of served records that need one and have no data, such as records read from a saved index,
   * in the domain's groups of the seed's scope members, newest cursor first, at most `limit`. A record is tried
   * once per crawler: one whose file stays gone or invalid is not fetched again until a later event replaces it.
   */
  hydrate(seed: string, limit?: number, signal?: AbortSignal): Promise<HydrateResult>;
  /** Replaces the `excluded` option from the next `syncScope` on. */
  setExcluded(users: Iterable<string>): void;
  stats(): CrawlerStats;
  /** Calls `listener` with fresh stats after every change. Returns the unsubscribe function. */
  subscribe(listener: (stats: CrawlerStats) => void): () => void;
  /**
   * Calls `listener` after each store commit that may change what is served: new entries, a moved trusted
   * range, a dropped homeserver or new scope members. Returns the unsubscribe function.
   */
  onCommit(listener: (change: StoreChange) => void): () => void;
}
