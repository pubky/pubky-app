// @vitest-environment node
import { expect, it } from 'vitest';
import { applyPageDelta, encodePageDelta, pageDeltaLength } from './page-delta.mjs';

const page = 16 * 1024;
function checkRoundTrip(base: Uint8Array, current: Uint8Array) {
  const encoded = encodePageDelta(base, current);
  expect(pageDeltaLength(encoded)).toBe(current.length);
  const result = applyPageDelta(base, encoded);
  expect(Buffer.compare(result, current)).toBe(0);
  return { encoded, result };
}

it('stores only changed pages, including a short tail, for aligned and unaligned input', () => {
  for (const offset of [0, 1, 2, 3]) {
    const base = new Uint8Array(5 * page + 5 + offset).subarray(offset);
    const current = new Uint8Array(base.length + offset).subarray(offset);
    current[2 * page - 1] = 42;
    current[current.length - 1] = 111;
    const { encoded, result } = checkRoundTrip(base, current);
    const view = new DataView(encoded.buffer);
    expect(encoded.length).toBe(9 + 4 + page + 4 + 5);
    expect(view.getUint32(5, true)).toBe(2);
    expect(view.getUint32(9, true)).toBe(1);
    expect(view.getUint32(13 + page, true)).toBe(5);
    result.fill(10);
    expect(current[0]).toBe(0);
    expect(base[0]).toBe(0);
    expect(Buffer.compare(applyPageDelta(base, encoded), current)).toBe(0);
  }
});

it('inherits just the surviving base bytes on shrink, and zero-fills growth at page and word boundaries', () => {
  const base = new Uint8Array(page + 3).fill(171);
  for (const length of [0, 2, 32, page - 1, page, page + 2, page + 3, page + 5, 4 * page]) {
    const current = new Uint8Array(length);
    current.set(base.subarray(0, length));
    const { encoded } = checkRoundTrip(base, current);
    expect(encoded.length).toBe(Math.min(9, length + 1));
    if (length > base.length) {
      current[base.length] = 123;
      current[length - 1] = 57;
      checkRoundTrip(base, current);
    }
  }
});

it('uses independent full bytes for dense changes, including bytes beginning with a payload tag', () => {
  const base = new Uint8Array(2 * page).fill(17);
  const current = new Uint8Array(3 * page + 3).fill(54);
  current[0] = 1;
  const { encoded } = checkRoundTrip(base, current);
  expect(encoded[0]).toBe(0);
  expect(encoded.length).toBe(current.length + 1);
  current.fill(99);
  const result = applyPageDelta(base, encoded);
  expect(result[0]).toBe(1);
  result.fill(0);
  expect(encoded[1]).toBe(1);
});

it('rejects bad tags, oversized decoded lengths, and malformed page lists before restoring', () => {
  const base = new Uint8Array(6 * page);
  const current = base.slice();
  current[page] = 3;
  current[3 * page] = 4;
  const valid = encodePageDelta(base, current);
  function setWord(position: number, n: number) {
    const copy = valid.slice();
    new DataView(copy.buffer).setUint32(position, n, true);
    return copy;
  }
  const invalid = [
    new Uint8Array(),
    Uint8Array.of(13),
    valid.slice(0, 6),
    setWord(1, 256 * 1024 * 1024 + 1),
    setWord(5, 7),
    setWord(9, 6),
    setWord(13 + page, 1),
    setWord(13 + page, 0),
    valid.slice(0, 14 + page),
    valid.slice(0, -1),
    new Uint8Array(valid.length + 1),
  ];
  invalid[invalid.length - 1].set(valid);
  for (const payload of invalid) {
    expect(() => pageDeltaLength(payload)).toThrow('Invalid wallet page delta');
    expect(() => applyPageDelta(base, payload)).toThrow('Invalid wallet page delta');
  }
  // The decoder honors a view inside a larger envelope.
  const envelope = new Uint8Array(valid.length + 7);
  envelope.set(valid, 4);
  expect(Buffer.compare(applyPageDelta(base, envelope.subarray(4, 4 + valid.length)), current)).toBe(0);
});
