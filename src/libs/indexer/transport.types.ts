import type { Cursor, StreamEvent } from './indexer.types';

/** A stream event with the user whose path it touched. */
export type AuthoredStreamEvent = StreamEvent & { author: string };

export interface ReadEventsRequest {
  homeserver: string;
  /** Per user, the cursor to read after; `null` starts at the stream start (or at the end when `reverse`). */
  users: Array<{ user: string; cursor: Cursor | null }>;
  /** Path prefixes to keep. */
  paths: string[];
  limit: number;
  reverse: boolean;
  signal?: AbortSignal;
}

export interface GetPublicRequest {
  author: string;
  path: string;
  signal?: AbortSignal;
}

/** A lock the homeserver granted on one index file. Opaque to the library: only the transport reads what it holds. */
export interface IndexFileLock {
  readonly path: string;
}

/**
 * The index's own files, at paths relative to the index's folder in the user's storage, such as `3/g1a2b3/hot`. Each
 * PUT replaces a file whole. A lock is an exclusive write lock on one path that expires on its own: while it lives,
 * only writes presenting it land there.
 */
export interface IndexFiles {
  /** Every file under `prefix` (`''` or ending in `/`), at any depth; empty when there is none. */
  list(prefix: string): Promise<string[]>;
  /** The file's bytes, or `null` when there is no file at the path. */
  read(path: string): Promise<Uint8Array | null>;
  /** With `lock`, throws `IndexFileLockLostError` once that lock is gone, and nothing lands. */
  write(path: string, bytes: Uint8Array, lock?: IndexFileLock): Promise<void>;
  /** A missing file counts as deleted. With `lock`, as `write`. */
  delete(path: string, lock?: IndexFileLock): Promise<void>;
  /** Throws `IndexFileLockedError` while another holder has the path. The homeserver may grant less than `seconds`. */
  lock(path: string, seconds: number): Promise<IndexFileLock>;
  /** Restarts the lock's lifetime; throws `IndexFileLockLostError` once it is gone. */
  refresh(lock: IndexFileLock, seconds: number): Promise<void>;
  /** Best effort: a lock that is gone already counts as released. */
  unlock(lock: IndexFileLock): Promise<void>;
}

/**
 * Everything the indexer needs from outside, injected by the app. Network methods throw
 * `HomeserverUnreachableError` or `RateLimitedError` from `indexer.errors` so callers branch on the class.
 * `indexFiles` keeps the indexer's saved index in the user's storage.
 */
export interface IndexerTransport {
  /** The homeserver a user publishes to, or `null` when it cannot be resolved. */
  resolveHomeserver(user: string): Promise<string | null>;
  readEvents(request: ReadEventsRequest): Promise<AuthoredStreamEvent[]>;
  /** The public file's bytes, or `null` when the homeserver answers 404. */
  getPublic(request: GetPublicRequest): Promise<Uint8Array | null>;
  indexFiles: IndexFiles;
}
