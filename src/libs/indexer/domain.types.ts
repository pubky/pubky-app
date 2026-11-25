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
  /** Creation time in microseconds when the path encodes one, else `null`. Finds the window start. */
  timeOfPath(path: string): bigint | null;
  /** Integrity check of fetched bytes against the event's content hash. */
  matchesHash?(bytes: Uint8Array, hash: string): boolean;
}
