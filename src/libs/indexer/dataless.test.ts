// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { shortHash } from './hash';
import type { Entry, Run } from './indexer.types';
import { createMemoryStore } from './memoryStore';
import { mergeRuns, sameEvent } from './merge';

interface Body {
  text: string;
}

const META = { author: 'alice', homeserver: 'hs1', group: 'posts' };
const FULL = btoa(String.fromCharCode(...Array.from({ length: 32 }, (_, i) => i + 1)));
const SHORT = btoa(String.fromCharCode(...Array.from({ length: 16 }, (_, i) => i + 1)));

const record = (cursor: number, hash: string, data?: Body): Entry<Body> =>
  data === undefined
    ? { kind: 'record', path: 'p', cursor: BigInt(cursor), hash }
    : { kind: 'record', path: 'p', cursor: BigInt(cursor), hash, data };
const run = (entries: Entry<Body>[]): Run<Body> => ({ ...META, tail: BigInt(0), head: BigInt(5), entries });

describe('records without data', () => {
  it('cuts a 32-byte base64 hash to its first 16 bytes and keeps anything else', () => {
    expect(FULL).toHaveLength(44);
    expect(shortHash(FULL)).toBe(SHORT);
    expect(shortHash(SHORT)).toBe(SHORT);
    expect(shortHash('fnv:1a2b')).toBe('fnv:1a2b');
    expect(sameEvent(record(3, FULL), record(3, SHORT))).toBe(true);
    expect(sameEvent(record(3, FULL), record(3, shortHash(btoa('x'.repeat(32)))))).toBe(false);
  });

  it('merges a copy with data over one without at the same cursor, in either order', () => {
    const withData = run([record(3, FULL, { text: 'hi' })]);
    const without = run([record(3, SHORT)]);

    expect(mergeRuns([withData, without]).entries.get('p')).toEqual(record(3, FULL, { text: 'hi' }));
    expect(mergeRuns([without, withData]).entries.get('p')).toEqual(record(3, FULL, { text: 'hi' }));
  });

  it('never lets a run without data erase a stored body, and lets a body fill a stored record', async () => {
    const kept = createMemoryStore<Body>();
    await kept.applyRuns([run([record(3, FULL, { text: 'hi' })])]);
    await kept.applyRuns([run([record(3, SHORT)])]);
    expect((await kept.readScope(META)).entries.get('p')).toEqual(record(3, FULL, { text: 'hi' }));

    const filled = createMemoryStore<Body>();
    await filled.applyRuns([run([record(3, SHORT)])]);
    await filled.applyRuns([run([record(3, FULL, { text: 'hi' })])]);
    expect((await filled.readScope(META)).entries.get('p')).toEqual(record(3, FULL, { text: 'hi' }));
  });

  it('keeps a meta value in the memory store', async () => {
    const store = createMemoryStore<Body>();

    expect(await store.readMeta?.('writer')).toBeNull();
    await store.writeMeta?.('writer', 'abc');
    expect(await store.readMeta?.('writer')).toBe('abc');
  });
});
