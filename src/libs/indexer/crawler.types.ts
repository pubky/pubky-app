import type { Domain } from './domain.types';
import type { Cursor } from './indexer.types';
import type { IndexStore } from './store.types';
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

/** Counters since the last `syncScope` started, backfills included. */
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
}

export interface SyncResult {
  /** Every user in scope, with its hop. */
  members: Map<string, number>;
  /** Homeservers that failed or were skipped while backing off; their users keep what was stored before. */
  failedHomeservers: string[];
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
  stats(): CrawlerStats;
  /** Calls `listener` with fresh stats after every change. Returns the unsubscribe function. */
  subscribe(listener: (stats: CrawlerStats) => void): () => void;
}
