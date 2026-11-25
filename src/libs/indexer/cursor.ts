import { InvalidIndexInputError } from './indexer.errors';
import type { Cursor } from './indexer.types';

// BigInt() calls, not bigint literals: the build targets ES2017, where literals do not compile.
export const CURSOR_ZERO: Cursor = BigInt(0);
export const MAX_CURSOR: Cursor = BigInt('18446744073709551615');

const CANONICAL_DECIMAL = /^(?:0|[1-9][0-9]*)$/;

export function isValidCursor(cursor: Cursor): boolean {
  return cursor >= CURSOR_ZERO && cursor <= MAX_CURSOR;
}

/** Parses the wire form: a canonical decimal (no sign, no leading zero, no spaces) that fits in 64 bits. */
export function parseCursor(value: string): Cursor {
  if (!CANONICAL_DECIMAL.test(value)) {
    throw new InvalidIndexInputError(`not a canonical cursor: ${JSON.stringify(value)}`);
  }
  const cursor = BigInt(value);
  if (cursor > MAX_CURSOR) throw new InvalidIndexInputError(`cursor ${value} does not fit in 64 bits`);
  return cursor;
}

export function formatCursor(cursor: Cursor): string {
  if (!isValidCursor(cursor)) throw new InvalidIndexInputError(`cursor ${cursor} is out of range`);
  return cursor.toString();
}

export function compareCursors(a: Cursor, b: Cursor): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Throws unless `(tail, head]` is a non-empty range of valid cursors. */
export function assertRange(tail: Cursor, head: Cursor): void {
  if (!isValidCursor(tail) || !isValidCursor(head)) {
    throw new InvalidIndexInputError(`range (${tail}, ${head}] has an out of range cursor`);
  }
  if (tail >= head) throw new InvalidIndexInputError(`range (${tail}, ${head}] is empty: tail must be below head`);
}
