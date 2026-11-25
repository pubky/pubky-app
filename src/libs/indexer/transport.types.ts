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

/**
 * Everything the indexer needs from outside, injected by the app. Network methods throw
 * `HomeserverUnreachableError` or `RateLimitedError` from `indexer.errors` so callers branch on the class.
 * The index file methods persist the indexer's own state on this device.
 */
export interface IndexerTransport {
  /** The homeserver a user publishes to, or `null` when it cannot be resolved. */
  resolveHomeserver(user: string): Promise<string | null>;
  readEvents(request: ReadEventsRequest): Promise<AuthoredStreamEvent[]>;
  /** The public file's bytes, or `null` when the homeserver answers 404. */
  getPublic(request: GetPublicRequest): Promise<Uint8Array | null>;
  listIndexFiles(): Promise<string[]>;
  /** The file's bytes, or `null` when no file has that name. */
  readIndexFile(name: string): Promise<Uint8Array | null>;
  writeIndexFile(name: string, bytes: Uint8Array): Promise<void>;
  deleteIndexFile(name: string): Promise<void>;
}
