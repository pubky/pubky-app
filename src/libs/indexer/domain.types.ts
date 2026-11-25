import type { RecordEntry } from './indexer.types';

/**
 * A set of path prefixes crawled together. `full` keeps an author's whole history; `window` starts at the
 * homeserver's window start cursor and grows backwards only on demand.
 */
export interface PathGroup {
  id: string;
  paths: string[];
  history: 'full' | 'window';
}

/** What the crawler needs to know about the data it indexes. `D` is the parsed payload of a record. */
export interface Domain<D> {
  groups: PathGroup[];
  /** The group, with `full` history, whose live records name the users an author links to. */
  scopeGroup: string;
  linksOf(live: ReadonlyMap<string, RecordEntry<D>>): string[];
  /** True when the record needs its file fetched to be useful. */
  needsBody(path: string): boolean;
  /** Parses and validates a fetched file. `null` means invalid: the record is kept without data. */
  reduce(author: string, path: string, bytes: Uint8Array): D | null;
  /**
   * When the record at the path was written, in microseconds, when the path encodes it, else `null`. Finds the window
   * start, so it is the time of the write itself: a new version of an old record is new.
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
