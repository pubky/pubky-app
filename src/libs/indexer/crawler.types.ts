import type { Schedule } from './concurrency';
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
  /**
   * Events per `backfill` page. Each page's files to render are fetched and the page committed before the next is
   * read, so a small page puts older history on screen in small steps instead of one long wait.
   */
  backfillPageLimit: number;
  lookupConcurrency: number;
  /**
   * Requests in flight to one homeserver at once, stream reads and file fetches of every operation together. The
   * crawler queues the rest itself, foreground first, instead of leaving the queue to the browser: a browser opens
   * 6 connections per host over HTTP/1.1. Raise it for a transport that runs more, such as HTTP/2 or Node's fetch.
   */
  homeserverConcurrency: number;
  /** Age of the oldest events a windowed group indexes before a backfill. */
  windowDays: number;
  /** How long a resolved homeserver is used before resolving the user again. */
  homeserverTtlMs: number;
  /** Most users in a scope, seed included; nearer hops win. */
  maxUsers: number;
  /** Users left out of every scope, and with them whoever is reached only through them. */
  excluded: ReadonlySet<string>;
  /**
   * Deadline of one stream read or file fetch. Past it the call's signal aborts and the request fails like one to an
   * unreachable homeserver, so a transport whose request never settles cannot stall a crawl.
   */
  requestTimeoutMs: number;
  /** Deadline of one homeserver lookup; past it the lookup fails like any other. */
  lookupTimeoutMs: number;
}

export const DEFAULT_CRAWLER_OPTIONS: Readonly<CrawlerOptions> = Object.freeze({
  hops: 2,
  batchSize: 50,
  pageLimit: 1000,
  backfillPageLimit: 100,
  lookupConcurrency: 8,
  homeserverConcurrency: 6,
  windowDays: 30,
  homeserverTtlMs: 6 * 60 * 60 * 1000,
  maxUsers: 2000,
  excluded: new Set<string>(),
  requestTimeoutMs: 30 * 1000,
  lookupTimeoutMs: 10 * 1000,
});

export interface CrawlerParams<D> {
  transport: IndexerTransport;
  store: IndexStore<D>;
  domain: Domain<D>;
  /** Wall clock in ms, injected so tests control time. */
  now: () => number;
  /** Waits before retrying a failed request; on `schedule` by default. Rejects with `IndexerAbortedError` on abort. */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  /** Timers for request deadlines; `setTimeout` by default. */
  schedule?: Schedule;
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
  /** Pages read and committed: none means the store is as it was. */
  pages: number;
  /** Stream events those pages held. */
  events: number;
}

/**
 * Crawls scopes into the store. Operations may run together, even over the same scopes: each one commits whole runs,
 * which merge in any order to the same result, and `hydrate` only sets the data of records still stored. An aborted
 * operation rejects with `IndexerAbortedError`, and everything it committed before stays valid.
 */
export interface Crawler {
  /**
   * Syncs the seed's whole scope. Its requests are background ones: at each homeserver they wait while a request of
   * another operation, other than `hydrate`, does, and never take its last free slot.
   */
  syncScope(seed: string, signal?: AbortSignal): Promise<SyncResult>;
  /**
   * Extends the author's top contiguous coverage of the group backwards by up to `pages` pages of `backfillPageLimit`
   * events. Without any coverage, as after a window that held none of the author's events, it starts at their newest
   * event.
   */
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
   * Fetches the files of served records that need one and have no data, newest cursor first, at most `limit`, and
   * commits each as it arrives, on the record if it is still stored. Its requests are idle ones: at each homeserver
   * they wait while a request of any other operation does, and never take its last free slot. It looks in `scopes`,
   * such as every stored scope after a start or the scopes of a saved index, and in the scopes left unfilled: those a crawl committed with `later` records, and those a call
   * could not finish, on a failing homeserver or past the limit. A record is tried once per crawler: one whose file
   * stays gone or invalid is not fetched again until a later event replaces it.
   */
  hydrate(scopes?: Iterable<ScopeKey>, limit?: number, signal?: AbortSignal): Promise<HydrateResult>;
  /** How many scopes the next `hydrate` looks in without being given any. */
  unfilled(): number;
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
