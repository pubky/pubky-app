import type { Schedule } from './concurrency';
import type { BackfillResult, CrawlerOptions, CrawlerStats, LeafRequest, StoreChange } from './crawler.types';
import type { Domain } from './domain.types';
import type { IndexStore } from './store.types';
import type { IndexerTransport } from './transport.types';

/**
 * Seals each saved index file after it is compressed and before it is written, and opens it after it is read, for
 * example with a key only the user holds (`createIndexSealer`). `path` is the file's path in the index folder.
 */
export interface IndexSealer {
  seal(bytes: Uint8Array, path: string): Promise<Uint8Array>;
  open(bytes: Uint8Array, path: string): Promise<Uint8Array>;
}

export type { Schedule } from './concurrency';

export interface RuntimeOptions {
  /** Pause between the end of a scope sync and the next one. */
  syncIntervalMs: number;
  /** How long a finished `ensureUser` or `ensureLeaf` satisfies the same call again. */
  ensureTtlMs: number;
  /** Changes are reported at most once per this period, merged. */
  changeDebounceMs: number;
  /**
   * Keeps the index in a folder of the user's storage that every device of theirs shares (`savedIndex.ts`), and
   * starts from it: a new device, or one that lost its local store, starts warm. Needs a store with meta values.
   */
  savedIndex: boolean;
  /** Least time between two saves after scope syncs; the save when pausing waits for none. */
  saveMinIntervalMs: number;
  /** A fold deletes another device's delta it folded once that device has not written it for this long. */
  writerExpiryMs: number;
  /** Largest the saved index folder aims for, sealed: packs past their share lose data first, then windowed history. */
  fileBudgetBytes: number;
  /** Seals the saved index files; a file that does not open is ignored, and never overwritten. */
  sealer?: IndexSealer;
  /** Least time between two backfills of one author's group, unless forced. */
  backfillMinIntervalMs: number;
  /** Deadline of one index file call: a file may be as large as `fileBudgetBytes`, so it gets longer than a read. */
  indexFileTimeoutMs: number;
  /**
   * Longest the crawls wait at start for the saved index's first files, `hot` and the deltas: a few times what a
   * healthy read takes, about a second, so a folder that hangs or fails delays the first sync by no more.
   */
  loadWaitMs: number;
  crawler: Partial<CrawlerOptions>;
}

export const DEFAULT_RUNTIME_OPTIONS: Readonly<RuntimeOptions> = Object.freeze({
  syncIntervalMs: 60 * 1000,
  ensureTtlMs: 5 * 60 * 1000,
  changeDebounceMs: 250,
  savedIndex: false,
  saveMinIntervalMs: 60 * 1000,
  writerExpiryMs: 30 * 24 * 60 * 60 * 1000,
  fileBudgetBytes: 200 * 1024 * 1024,
  backfillMinIntervalMs: 30 * 1000,
  indexFileTimeoutMs: 2 * 60 * 1000,
  loadWaitMs: 3 * 1000,
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
  | { type: 'settled'; id: string; error: string | null; backfill?: BackfillResult }
  /** The sender finished a scope sync of the seed at `at` (ms), its fill still to come when `bodiesPending`. */
  | { type: 'synced'; seed: string; at: number; bodiesPending: boolean }
  /** What the crawling tab's stored records lack changed: files pending, and the homeservers failing with some. */
  | { type: 'bodies'; seed: string; pending: boolean; failing: string[] };

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
  /** Files that did not open or decode, had an unknown version or another seed. */
  ignoredFiles: number;
  /** When this tab last saved (ms): wrote its delta, or folded, or found nothing to write. */
  lastSavedAt: number | null;
  /** The last failed load or save, cleared by the next save that succeeds. */
  error: Error | null;
}

export interface RuntimeStatus {
  /** `syncing` while this tab runs a crawl or a fill, or has one due. */
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
  /**
   * True while stored records lack a file the crawling tab knows of: its fill runs or is due, or a fill ended with
   * files still missing on a failing homeserver (`bodiesFailing`), which the fill after the next crawl tries again.
   * Until then answers that count or list what those records add, such as tags, may still grow, so answers never say
   * they are settled. A tab that does not crawl hears it from the crawling one.
   */
  bodiesPending: boolean;
  /**
   * The homeservers the last fill could not reach, failing or backing off, while files of theirs are missing: what
   * keeps `bodiesPending` true once no fill runs. Empty when nothing is missing.
   */
  bodiesFailing: string[];
  /**
   * When the data behind the answers was last synced (ms): the newest of this run's scope syncs, in any tab, the
   * previous session's last one kept in the store, and the loaded index files; `null` when none is known.
   */
  asOf: number | null;
  /** Present while `savedIndex` is on. */
  savedIndex?: SavedIndexStatus;
}

export interface RuntimeParams<D> {
  transport: IndexerTransport;
  store: IndexStore<D>;
  domain: Domain<D>;
  /** Wall clock in ms. */
  now: () => number;
  /** Timers, request deadlines included; `setTimeout` by default. */
  schedule?: Schedule;
  /** Without it the runtime crawls as if it were the only tab. Its owner closes it: the runtime never does. */
  coordination?: Coordination | null;
  options?: Partial<RuntimeOptions>;
}

/**
 * Keeps a seed's scope synced into the store. Requests run one at a time, and the scope sync beside them: at every
 * homeserver the requests' calls go first, so a request never waits for a scope sync and never aborts one. With
 * coordination only the tab holding the lock crawls; the others send it their requests and report the changes it
 * announces.
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
   * crawling tab writes its delta first when anything changed.
   */
  pause(): void;
  resume(): void;
  /** Syncs the whole scope, or only these users. Resolves once committed. */
  refresh(users?: readonly string[]): Promise<void>;
  ensureUser(user: string): Promise<void>;
  ensureLeaf(leaf: LeafRequest): Promise<void>;
  /**
   * Shares a call while one for the same author and group is pending, and settles at once with `null`, doing nothing,
   * within `backfillMinIntervalMs` after one finished, unless `force`: each finished backfill moves further back.
   * Otherwise settles with the step, once committed.
   */
  backfill(author: string, group: string, pages: number, options?: { force?: boolean }): Promise<BackfillResult | null>;
  /**
   * Deletes what `ensureUser` or `ensureLeaf` loaded and lets the next such call load it again. The domain groups of
   * the seed's scope members are kept. Every tab hears it as a change listing the scopes in `forgotten`.
   */
  forget(target: { users?: readonly string[]; leaves?: readonly LeafRequest[] }): Promise<void>;
  /**
   * Leaves these users out of the scope from the next scope sync on, and whoever is reached only through them. Each
   * tab sets its own; the crawling tab's apply.
   */
  setExcluded(users: Iterable<string>): void;
  /** Called after commits, from this tab or another, merged and at most once per `changeDebounceMs`. */
  onChange(listener: (change: StoreChange) => void): () => void;
  status(): RuntimeStatus;
  onStatus(listener: (status: RuntimeStatus) => void): () => void;
}
