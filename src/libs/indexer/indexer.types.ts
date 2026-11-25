/**
 * A homeserver's global event sequence number: an unsigned 64-bit integer, strictly increasing in commit
 * order and shared by every user of that homeserver. Cursors of different homeservers are not comparable.
 */
export type Cursor = bigint;

export interface StreamEvent {
  type: 'PUT' | 'DEL';
  path: string;
  cursor: Cursor;
  /** Content hash, present on PUT. */
  hash?: string;
}

/** A live write of `path` at `cursor`. `data` is an opaque payload owned by the domain module. */
export interface RecordEntry<D = unknown> {
  kind: 'record';
  path: string;
  cursor: Cursor;
  hash?: string;
  data?: D;
}

/** A delete of `path` at `cursor`. */
export interface TombstoneEntry {
  kind: 'tombstone';
  path: string;
  cursor: Cursor;
}

/** One statement about one path at one cursor. */
export type Entry<D = unknown> = RecordEntry<D> | TombstoneEntry;

/** The half-open cursor range `(tail, head]`. */
export interface Range {
  tail: Cursor;
  head: Cursor;
}

/** Sorted, disjoint ranges, with adjacent and overlapping ranges merged. */
export type Coverage = Range[];

/** What a run is about: one author's paths of one group, read from one homeserver. */
export interface RunMeta {
  author: string;
  homeserver: string;
  group: string;
}

/**
 * The fold of every event of one scope in `(tail, head]`: per path, the last event in the range. A run speaks
 * for its whole range, so a path with no entry had no live write and no delete in the range as of `head`.
 * Invariants (see `validateRun`): `tail < head`, every entry cursor in `(tail, head]`, at most one entry per
 * path, entries sorted by path in code-unit order.
 */
export interface Run<D = unknown> extends RunMeta, Range {
  entries: Entry<D>[];
}

export interface MergedRuns<D = unknown> {
  /** The winning entry of every path whose winner is a record, keyed by path. */
  live: Map<string, RecordEntry<D>>;
  /** The winning entry of every path, record or tombstone, keyed by path. */
  entries: Map<string, Entry<D>>;
  coverage: Coverage;
}
