// @vitest-environment node
import { expect, it } from 'vitest';
import { checkpointDigest, createOverlay, packFiles, unpackFiles } from './vault-overlay.mjs';

const digest = Uint8Array.from({ length: 32 }, (_, i) => i);

it('reconstructs the complete directory from an independent overlay and immutable same-name files', () => {
  const db = new Uint8Array(64 * 1024).fill(7);
  const base = new Map([
    ['db', db],
    ['old', Uint8Array.of(18)],
    ['moved', Uint8Array.of(9)],
  ]);
  const encoder = createOverlay(base, digest);
  const current = new Map(base);
  current.delete('old');
  current.set('empty', new Uint8Array());
  current.set('moved', db);
  const updated = db.slice();
  updated.fill(127, 512, 576);
  current.set('db', updated);
  const previous = encoder.pack(current, Infinity)!;
  const decoder = createOverlay(base, digest);
  expect(decoder.restore(previous)).toEqual(current);
  expect(checkpointDigest(previous)).toEqual(digest);
  expect(() => unpackFiles(previous)).toThrow();
  const newer = updated.slice();
  newer[56_000] = 11;
  current.set('db', newer);
  const next = encoder.pack(current, Infinity)!;
  expect(createOverlay(base, digest).restore(next)).toEqual(current);
  expect(decoder.restore(previous).get('db')).toEqual(updated);
  expect(encoder.pack(current, 128)).toBeNull();
  // A rebase can keep a live array under a different filename.
  encoder.wipe(new Set(current.values()));
  expect(current.get('moved')?.[0]).toBe(7);
});

it('rejects an oversized aggregate, unknown inherited files, duplicate names and a mismatched checkpoint', () => {
  const overlay = createOverlay(new Map(), digest);
  const header = overlay.pack(new Map(), Infinity)!;
  const manifest = (...records: Uint8Array[]) => Uint8Array.from(Buffer.concat([header, ...records]));
  const sparse = new Uint8Array(9);
  sparse[0] = 1;
  new DataView(sparse.buffer).setUint32(1, 160 * 1024 * 1024, true);
  const entry = (path: string, payload: Uint8Array) => packFiles(new Map([[path, payload]]));
  expect(() => overlay.restore(manifest(entry('a', sparse), entry('b', sparse)))).toThrow('storage limit');
  expect(() => overlay.restore(manifest(entry('absent', new Uint8Array())))).toThrow();
  const full = entry('duplicate', Uint8Array.of(0, 29));
  expect(() => overlay.restore(manifest(full, full))).toThrow();
  expect(() => overlay.restore(manifest(full.subarray(0, full.length - 1)))).toThrow();
  const other = createOverlay(new Map(), new Uint8Array(32).fill(255));
  expect(() => other.restore(manifest(full))).toThrow();
});
