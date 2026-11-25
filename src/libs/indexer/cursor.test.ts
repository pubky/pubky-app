import { describe, expect, it } from 'vitest';
import { assertRange, compareCursors, CURSOR_ZERO, formatCursor, MAX_CURSOR, parseCursor } from './cursor';
import { InvalidIndexInputError } from './indexer.errors';

const MALFORMED = ['', '-1', '+1', '01', '1.0', ' 1', '1e3', '0x10', '1_000', '\u0661', '18446744073709551616'];

describe('cursors', () => {
  it.each(['0', '7', '42', '1000000', '18446744073709551615'])('parses %j and formats it back', (wire) => {
    const cursor = parseCursor(wire);

    expect(cursor).toBe(BigInt(wire));
    expect(formatCursor(cursor)).toBe(wire);
  });

  it.each(MALFORMED)('rejects %j', (wire) => {
    expect(() => parseCursor(wire)).toThrow(InvalidIndexInputError);
  });

  it('refuses to format a cursor outside 64 unsigned bits', () => {
    expect(() => formatCursor(BigInt(-1))).toThrow(InvalidIndexInputError);
    expect(() => formatCursor(MAX_CURSOR + BigInt(1))).toThrow(InvalidIndexInputError);
  });

  it('compares cursors numerically, past the range of a double', () => {
    expect(compareCursors(BigInt(2), BigInt(10))).toBe(-1);
    expect(compareCursors(MAX_CURSOR, MAX_CURSOR - BigInt(1))).toBe(1);
    expect(compareCursors(CURSOR_ZERO, BigInt(0))).toBe(0);
  });

  it('accepts only non-empty ranges of valid cursors', () => {
    expect(() => assertRange(CURSOR_ZERO, BigInt(1))).not.toThrow();
    expect(() => assertRange(BigInt(3), BigInt(3))).toThrow(InvalidIndexInputError);
    expect(() => assertRange(BigInt(4), BigInt(3))).toThrow(InvalidIndexInputError);
    expect(() => assertRange(BigInt(-1), BigInt(3))).toThrow(InvalidIndexInputError);
    expect(() => assertRange(CURSOR_ZERO, MAX_CURSOR + BigInt(1))).toThrow(InvalidIndexInputError);
  });
});
