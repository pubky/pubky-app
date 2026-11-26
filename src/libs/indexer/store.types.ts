import type { Coverage, Cursor, MergedRuns, Run, RunMeta } from './indexer.types';

/** A run's scope: one author's paths of one group on one homeserver. The store keeps each scope merged. */
export type ScopeKey = RunMeta;

/** The homeserver a user publishes to, `null` when it did not resolve, as of `resolvedAt` (ms). */
export interface UserHomeserver {
  homeserver: string | null;
  resolvedAt: number;
}

/**
 * The newest event seen on a homeserver and its author. A later read of that author's newest event can
 * only find it again or something newer, unless the homeserver lost its log.
 */
export interface HighWater {
  cursor: Cursor;
  author: string;
}

/** The first cursor of the windowed history, found at `foundAt` (ms). */
export interface WindowStart {
  cursor: Cursor;
  foundAt: number;
}

/** Consecutive failures and when the homeserver may be tried again (ms). */
export interface FailureState {
  failures: number;
  retryAt: number;
}

export interface HomeserverState {
  /** Only ever rises within an epoch. */
  highWater: HighWater | null;
  /** Counts the homeserver's deletions: what was read before one is not read under the epoch after it. */
  epoch: number;
  windowStart: WindowStart | null;
  failure: FailureState | null;
}

export const EMPTY_HOMESERVER_STATE: Readonly<HomeserverState> = Object.freeze({
  highWater: null,
  epoch: 0,
  windowStart: null,
  failure: null,
});

/** A high-water mark older than the stored one keeps the stored. Fields left out keep their stored value. */
export interface HomeserverPatch {
  highWater?: HighWater;
  windowStart?: WindowStart | null;
  failure?: FailureState | null;
}

/** The homeserver epoch a batch's reads of it were made under. */
export interface ReadAt {
  homeserver: string;
  epoch: number;
}

/** The data of the record a scope stores for `path` at `cursor`. */
export interface RecordData<D> {
  scope: ScopeKey;
  path: string;
  cursor: Cursor;
  data: D;
}

/**
 * Changes applied together by `commit`, in this order: homeserver deletions, evictions, runs, record data, then user
 * homeservers, homeserver state patches and scope members.
 */
export interface StoreBatch<D> {
  /**
   * The epochs the batch's reads were made under. Unless each is still its homeserver's epoch, the batch changes
   * nothing: what it read may predate a deletion.
   */
  readAt?: ReadAt[];
  /**
   * Drops every scope stored under these homeservers and starts a new epoch for each, without a high-water mark or a
   * window start.
   */
  deleteHomeservers?: string[];
  /** Forgets each scope's entries and coverage at or below the cutoff. */
  evictions?: Array<{ scope: ScopeKey; cutoff: Cursor }>;
  /** Merged into their scopes, in order. */
  applyRuns?: Run<D>[];
  /**
   * Each set on its record while the scope's entry of the path is still that record, at that cursor: the same as
   * applying the run of that one event with its data. Once the entry is replaced, evicted or deleted, it sets nothing.
   */
  recordData?: RecordData<D>[];
  userHomeservers?: Array<{ user: string; value: UserHomeserver }>;
  homeserverStates?: Array<{ homeserver: string; patch: HomeserverPatch }>;
  /** Replaces the users in scope of a seed, each with its hop distance. */
  scopeMembers?: Array<{ seed: string; members: ReadonlyMap<string, number> }>;
}

/**
 * The indexer's persistent state. Every call is atomic: a failed call changes nothing. Values are copied on the
 * way in and out, so callers never share objects with the store. Runs are validated on the way in.
 *
 * A scope is stored merged: per path its winning entry, and its coverage. After any runs are applied, in any
 * order, `readScope` equals `mergeRuns` of those runs and `exportRuns` equals their `compactRuns`.
 */
export interface IndexStore<D> {
  /** Merges each run into its scope. Writes only the entries the run wins. */
  applyRuns(runs: Run<D>[]): Promise<void>;
  /** An empty scope reads as `mergeRuns([])`. */
  readScope(scope: ScopeKey): Promise<MergedRuns<D>>;
  /** The scope's coverage alone, without loading its entries. */
  readCoverage(scope: ScopeKey): Promise<Coverage>;
  /** The scope as one run per contiguous range of its coverage. */
  exportRuns(scope: ScopeKey): Promise<Run<D>[]>;
  /** What the pure `evictBelow` makes of the scope's exported runs. */
  evictBelow(scope: ScopeKey, cutoff: Cursor): Promise<void>;
  /** Every scope with coverage. */
  listScopes(): Promise<ScopeKey[]>;
  /** The same as committing `deleteHomeservers: [homeserver]`. */
  deleteHomeserver(homeserver: string): Promise<void>;
  /** `null` when the user was never resolved. */
  readUserHomeserver(user: string): Promise<UserHomeserver | null>;
  writeUserHomeserver(user: string, value: UserHomeserver): Promise<void>;
  /** `EMPTY_HOMESERVER_STATE` for a homeserver never written. */
  readHomeserverState(homeserver: string): Promise<HomeserverState>;
  patchHomeserverState(homeserver: string, patch: HomeserverPatch): Promise<void>;
  /** An empty map for a seed never written. */
  readScopeMembers(seed: string): Promise<Map<string, number>>;
  writeScopeMembers(seed: string, members: ReadonlyMap<string, number>): Promise<void>;
  commit(batch: StoreBatch<D>): Promise<void>;
  /** A value the indexer keeps for itself, such as its writer id; `null` when never written. */
  readMeta?(key: string): Promise<string | null>;
  /** Optional with `readMeta`: a store without both keeps no saved index. */
  writeMeta?(key: string, value: string): Promise<void>;
}
