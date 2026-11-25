import type { CrawlerOptions, CrawlerStats, LeafRequest, StoreChange } from './crawler.types';
import type { Domain } from './domain.types';
import type { IndexStore } from './store.types';
import type { IndexerTransport } from './transport.types';

/** Runs `callback` after `ms` and returns the function that cancels it. */
export type Schedule = (callback: () => void, ms: number) => () => void;

export interface RuntimeOptions {
  /** Pause between the end of a scope sync and the next one. */
  syncIntervalMs: number;
  /** How long a finished `ensureUser` or `ensureLeaf` satisfies the same call again. */
  ensureTtlMs: number;
  /** Changes are reported at most once per this period, merged. */
  changeDebounceMs: number;
  /**
   * Keeps this device's index in a file of the user's storage and starts from the files of other devices, or from its
   * own after losing the local store. Needs a store with meta values.
   */
  savedIndex: boolean;
  /** Least time between two saves after scope syncs; the save when pausing waits for none. */
  saveMinIntervalMs: number;
  /** Other devices' files not written for this long are deleted at start. */
  writerExpiryMs: number;
  /** Largest file the save aims for, trimming windowed history oldest first. */
  fileBudgetBytes: number;
  /** Least time between two backfills of one author's group, unless forced. */
  backfillMinIntervalMs: number;
  crawler: Partial<CrawlerOptions>;
}

export const DEFAULT_RUNTIME_OPTIONS: Readonly<RuntimeOptions> = Object.freeze({
  syncIntervalMs: 60 * 1000,
  ensureTtlMs: 5 * 60 * 1000,
  changeDebounceMs: 250,
  savedIndex: false,
  saveMinIntervalMs: 60 * 1000,
  writerExpiryMs: 30 * 24 * 60 * 60 * 1000,
  fileBudgetBytes: 2 * 1024 * 1024,
  backfillMinIntervalMs: 30 * 1000,
  crawler: {},
});

/** One crawler operation, as it is queued and sent between tabs. */
export type CrawlRequest =
  | { kind: 'scope' }
  | { kind: 'users'; users: string[] }
  | { kind: 'leaf'; leaf: LeafRequest }
  | { kind: 'backfill'; author: string; group: string; pages: number };

/** What runtimes of one store tell each other. */
export type CoordinationMessage =
  /** The sender committed this to the shared store. */
  | { type: 'changed'; change: StoreChange }
  /** The sender now crawls for the seed; requests still unanswered go to it. */
  | { type: 'leader'; seed: string }
  /** Asks the crawling tab of the seed to run a crawl and answer with `settled`. */
  | { type: 'request'; seed: string; id: string; request: CrawlRequest }
  | { type: 'settled'; id: string; error: string | null }
  /** The sender finished a scope sync of the seed at `at` (ms). */
  | { type: 'synced'; seed: string; at: number };

/** How runtimes in several tabs share one store: one crawls, the others listen. */
export interface Coordination {
  /** Runs `task` holding the named lock across tabs, after waiting for it; the lock is held until `task` settles. */
  runExclusive(name: string, task: () => Promise<void>): Promise<void>;
  /** Delivers to every other tab, never back to the sender. */
  post(message: CoordinationMessage): void;
  subscribe(listener: (message: CoordinationMessage) => void): () => void;
}

export type RuntimeState = 'idle' | 'syncing' | 'stopped' | 'error';

export interface SavedIndexStatus {
  /** Files applied at start. */
  loadedFiles: number;
  /** Files that did not decode, had an unknown version or another seed. */
  ignoredFiles: number;
  /** When this tab last wrote its file (ms). */
  lastSavedAt: number | null;
  /** The last failed load or save, cleared by the next save that succeeds. */
  error: Error | null;
}

export interface RuntimeStatus {
  state: RuntimeState;
  seed: string | null;
  /** When the last scope sync of this tab finished without error (ms). */
  lastSyncAt: number | null;
  /** The last failed crawl's error, cleared by a successful scope sync. */
  lastError: Error | null;
  stats: CrawlerStats;
  /**
   * True from `start` until the first scope sync of this run settles, failed included, in this tab or in the
   * crawling one: answers until then come from a partial scope. A tab that never crawls learns it from the crawling
   * tab's next sync.
   */
  firstSyncPending: boolean;
  /** Present while `savedIndex` is on. */
  savedIndex?: SavedIndexStatus;
}

export interface RuntimeParams<D> {
  transport: IndexerTransport;
  store: IndexStore<D>;
  domain: Domain<D>;
  /** Wall clock in ms. */
  now: () => number;
  /** Timers; `setTimeout` by default. */
  schedule?: Schedule;
  /** Without it the runtime crawls as if it were the only tab. */
  coordination?: Coordination | null;
  options?: Partial<RuntimeOptions>;
}

/**
 * Keeps a seed's scope synced into the store. Every crawl goes through one queue, so crawler operations never
 * overlap. Requests run before a scope sync and pre-empt a running one, which resumes after them from what it
 * committed; a scope sync pre-empted three times in a row runs its next pass to the end first. With coordination
 * only the tab holding the lock crawls; the others send it their requests and report the changes it announces.
 */
export interface IndexerRuntime {
  /**
   * Syncs the scope now and then every interval. Starting with another seed stops the current one first. With `null`
   * it runs in visitor mode: no scope sync and no saved index, only the on-demand crawls, in every tab on its own.
   */
  start(seed: string | null): void;
  /** Aborts the running crawl, rejects queued requests and clears timers. Safe to call twice. */
  stop(): void;
  /**
   * Lets the running crawl finish and starts nothing else; with coordination it hands crawling to another tab. The
   * crawling tab saves its index file first when anything changed.
   */
  pause(): void;
  resume(): void;
  /** Syncs the whole scope, or only these users. Resolves once committed. */
  refresh(users?: readonly string[]): Promise<void>;
  ensureUser(user: string): Promise<void>;
  ensureLeaf(leaf: LeafRequest): Promise<void>;
  /**
   * Shares a call while one for the same author and group is pending, and settles at once, doing nothing, within
   * `backfillMinIntervalMs` after one finished, unless `force`: each finished backfill moves further back.
   */
  backfill(author: string, group: string, pages: number, options?: { force?: boolean }): Promise<void>;
  /**
   * Deletes what `ensureUser` or `ensureLeaf` loaded and lets the next such call load it again. The domain groups of
   * the seed's scope members are kept. Every tab hears it as a change listing the scopes in `forgotten`.
   */
  forget(target: { users?: readonly string[]; leaves?: readonly LeafRequest[] }): Promise<void>;
  /** Called after commits, from this tab or another, merged and at most once per `changeDebounceMs`. */
  onChange(listener: (change: StoreChange) => void): () => void;
  status(): RuntimeStatus;
  onStatus(listener: (status: RuntimeStatus) => void): () => void;
}
