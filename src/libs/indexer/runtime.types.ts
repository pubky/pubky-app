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
  crawler: Partial<CrawlerOptions>;
}

export const DEFAULT_RUNTIME_OPTIONS: Readonly<RuntimeOptions> = Object.freeze({
  syncIntervalMs: 60 * 1000,
  ensureTtlMs: 5 * 60 * 1000,
  changeDebounceMs: 250,
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
  | { type: 'settled'; id: string; error: string | null };

/** How runtimes in several tabs share one store: one crawls, the others listen. */
export interface Coordination {
  /** Runs `task` holding the named lock across tabs, after waiting for it; the lock is held until `task` settles. */
  runExclusive(name: string, task: () => Promise<void>): Promise<void>;
  /** Delivers to every other tab, never back to the sender. */
  post(message: CoordinationMessage): void;
  subscribe(listener: (message: CoordinationMessage) => void): () => void;
}

export type RuntimeState = 'idle' | 'syncing' | 'stopped' | 'error';

export interface RuntimeStatus {
  state: RuntimeState;
  seed: string | null;
  /** When the last scope sync of this tab finished without error (ms). */
  lastSyncAt: number | null;
  /** The last failed crawl's error, cleared by a successful scope sync. */
  lastError: Error | null;
  stats: CrawlerStats;
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
 * overlap, and requests run before the periodic sync. With coordination only the tab holding the lock crawls;
 * the others send it their requests and report the changes it announces.
 */
export interface IndexerRuntime {
  /** Syncs the scope now and then every interval. Starting with another seed stops the current one first. */
  start(seed: string): void;
  /** Aborts the running crawl, rejects queued requests and clears timers. Safe to call twice. */
  stop(): void;
  /** Lets the running crawl finish and starts nothing else; with coordination it hands crawling to another tab. */
  pause(): void;
  resume(): void;
  /** Syncs the whole scope, or only these users. Resolves once committed. */
  refresh(users?: readonly string[]): Promise<void>;
  ensureUser(user: string): Promise<void>;
  ensureLeaf(leaf: LeafRequest): Promise<void>;
  /** Shares a call only while the same one is pending: each finished backfill moves further back. */
  backfill(author: string, group: string, pages: number): Promise<void>;
  /** Called after commits, from this tab or another, merged and at most once per `changeDebounceMs`. */
  onChange(listener: (change: StoreChange) => void): () => void;
  status(): RuntimeStatus;
  onStatus(listener: (status: RuntimeStatus) => void): () => void;
}
