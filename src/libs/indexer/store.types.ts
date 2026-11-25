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
  highWater: HighWater | null;
  windowStart: WindowStart | null;
  failure: FailureState | null;
}

export const EMPTY_HOMESERVER_STATE: Readonly<HomeserverState> = Object.freeze({
  highWater: null,
  windowStart: null,
  failure: null,
});

/**
 * Changes applied together by `commit`, in this order: homeserver deletions, evictions, runs, then user
 * homeservers, homeserver state patches and scope members.
 */
export interface StoreBatch<D> {
  /** Drops every scope stored under these homeservers. */
  deleteHomeservers?: string[];
  /** Forgets each scope's entries and coverage at or below the cutoff. */
  evictions?: Array<{ scope: ScopeKey; cutoff: Cursor }>;
  /** Merged into their scopes, in order. */
  applyRuns?: Run<D>[];
  userHomeservers?: Array<{ user: string; value: UserHomeserver }>;
  /** Fields left out keep their stored value. */
  homeserverStates?: Array<{ homeserver: string; patch: Partial<HomeserverState> }>;
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
  deleteHomeserver(homeserver: string): Promise<void>;
  /** `null` when the user was never resolved. */
  readUserHomeserver(user: string): Promise<UserHomeserver | null>;
  writeUserHomeserver(user: string, value: UserHomeserver): Promise<void>;
  /** `EMPTY_HOMESERVER_STATE` for a homeserver never written. */
  readHomeserverState(homeserver: string): Promise<HomeserverState>;
  patchHomeserverState(homeserver: string, patch: Partial<HomeserverState>): Promise<void>;
  /** An empty map for a seed never written. */
  readScopeMembers(seed: string): Promise<Map<string, number>>;
  writeScopeMembers(seed: string, members: ReadonlyMap<string, number>): Promise<void>;
  commit(batch: StoreBatch<D>): Promise<void>;
}
