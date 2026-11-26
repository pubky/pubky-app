import type { Entry, RecordEntry } from './indexer.types';

/**
 * A set of path prefixes crawled together. `full` keeps an author's whole history; `window` starts where the
 * author's writes date older than the window and grows backwards only on demand.
 */
export interface PathGroup {
  id: string;
  paths: string[];
  history: 'full' | 'window';
}

/**
 * When a record's file is fetched. `render`: before its run commits, for a record that what it belongs to cannot be
 * shown without, such as a post or a profile. `later`: after the run commits, for a record that only adds to what is
 * shown already, such as a tag to a post's counts. An answer the index calls exact may rest on `render` records only.
 */
export type BodyNeed = 'render' | 'later';

/** What the crawler needs to know about the data it indexes. `D` is the parsed payload of a record. */
export interface Domain<D> {
  groups: PathGroup[];
  /** The group, with `full` history, whose live records name the users an author links to. */
  scopeGroup: string;
  /** `entries` are the scope's merged entries, tombstones included, when the caller has them. */
  linksOf(live: ReadonlyMap<string, RecordEntry<D>>, entries?: ReadonlyMap<string, Entry<D>>): string[];
  /** When the record's file is fetched, `null` for a record useful without it. */
  needsBody(path: string): BodyNeed | null;
  /** Parses and validates a fetched file. `null` means invalid: the record is kept without data. */
  reduce(author: string, path: string, bytes: Uint8Array): D | null;
  /**
   * When the record at the path was written, in microseconds, when the path encodes it, else `null`. Ends an author's
   * window, so it is the time of the write itself: a new version of an old record is new.
   */
  timeOfPath(path: string): bigint | null;
  /**
   * Integrity check of fetched bytes against the event's content hash. A record read from a saved index keeps only
   * the hash's first 16 bytes (`shortHash`), so a check must accept that form too.
   */
  matchesHash?(bytes: Uint8Array, hash: string): boolean;
  /**
   * Validates a payload read back from a saved index, where it is written as JSON and untrusted: the payload, or
   * `null` to load the record without data and fetch its file later. Without it, payloads in a file are dropped.
   */
  reviveData?(author: string, path: string, value: unknown): D | null;
}
