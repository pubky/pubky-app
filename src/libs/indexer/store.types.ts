import type { Cursor, Run, RunMeta } from './indexer.types';

/** A run's scope: one author's paths of one group on one homeserver. Runs are stored per scope. */
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
 * Changes applied together by `commit`, in this order: homeserver deletions, run replacements, run appends,
 * then user homeservers, homeserver state patches and scope members.
 */
export interface StoreBatch<D> {
  /** Drops every run stored under these homeservers. */
  deleteHomeservers?: string[];
  /** Replaces all runs of each scope; an empty list removes the scope. */
  replaceRuns?: Array<{ scope: ScopeKey; runs: Run<D>[] }>;
  appendRuns?: Run<D>[];
  userHomeservers?: Array<{ user: string; value: UserHomeserver }>;
  /** Fields left out keep their stored value. */
  homeserverStates?: Array<{ homeserver: string; patch: Partial<HomeserverState> }>;
  /** Replaces the users in scope of a seed, each with its hop distance. */
  scopeMembers?: Array<{ seed: string; members: ReadonlyMap<string, number> }>;
}

/**
 * The indexer's persistent state. Every call is atomic: a failed call changes nothing. Values are copied on the
 * way in and out, so callers never share objects with the store. Runs are validated on the way in.
 */
export interface IndexStore<D> {
  readRuns(scope: ScopeKey): Promise<Run<D>[]>;
  appendRuns(runs: Run<D>[]): Promise<void>;
  replaceRuns(scope: ScopeKey, runs: Run<D>[]): Promise<void>;
  listScopes(): Promise<ScopeKey[]>;
  deleteHomeserverRuns(homeserver: string): Promise<void>;
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
