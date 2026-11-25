// @vitest-environment node
import { gunzipSync, gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { shortHash } from './hash';
import type { Entry, Run } from './indexer.types';
import { decodeIndexFile, encodeIndexFile, type IndexFileModel } from './indexFile';
import { int, randomCase, type Rng, seeded } from './merge.generators';

interface Body {
  text: string;
}

const FULL = 'AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyA=';

const FIXED: IndexFileModel<Body> = {
  writer: 'w1',
  writtenAt: 1700000000000,
  seed: 'alice',
  hops: 2,
  windowDays: 30,
  members: [
    { user: 'alice', hop: 0, homeserver: { homeserver: 'hs1', resolvedAt: 1699999999000 } },
    { user: 'bob', hop: 1, homeserver: null },
  ],
  highWater: [{ homeserver: 'hs1', highWater: { cursor: BigInt(9), author: 'bob' } }],
  runs: [
    {
      author: 'alice',
      homeserver: 'hs1',
      group: 'graph',
      tail: BigInt(0),
      head: BigInt(4),
      entries: [
        { kind: 'record', path: '/follows/bob', cursor: BigInt(2) },
        { kind: 'tombstone', path: '/follows/carol', cursor: BigInt(4) },
      ],
    },
    {
      author: 'bob',
      homeserver: 'hs1',
      group: 'activity',
      tail: BigInt(5),
      head: BigInt(9),
      entries: [{ kind: 'record', path: '/posts/1', cursor: BigInt(9), hash: FULL, data: { text: 'hi' } }],
    },
  ],
};

// The reference vector of format version 1, for a reader in any language: FIXED gunzipped.
const FIXED_JSON =
  '[1,"w1",1700000000000,0,2,30,["alice","hs1","bob"],[[0,0,1,1699999999000],[2,1]],[[1,"9",2]],' +
  '[[0,1,"graph","0","4","/follows/",[["bob","2",0],["carol","4",1]]],' +
  '[2,1,"activity","5","9","",[["/posts/1","9",0,"AQIDBAUGBwgJCgsMDQ4PEA=="]]]]]';

const gunzipJson = (bytes: Uint8Array): string => gunzipSync(bytes).toString('utf8');
const gzipJson = (value: unknown): Uint8Array => new Uint8Array(gzipSync(JSON.stringify(value)));
const fixedValue = (): unknown[] => JSON.parse(FIXED_JSON) as unknown[];

/** What a reader gets back for a model: no data, hashes cut to 16 bytes. */
function stripped<D>(model: IndexFileModel<D>): IndexFileModel {
  const runs = model.runs.map((run): Run<never> => ({
    ...run,
    entries: run.entries.map((entry): Entry<never> => {
      if (entry.kind === 'tombstone') return entry;
      return entry.hash === undefined
        ? { kind: 'record', path: entry.path, cursor: entry.cursor }
        : { kind: 'record', path: entry.path, cursor: entry.cursor, hash: shortHash(entry.hash) };
    }),
  }));
  return { ...model, runs };
}

const base64Of = (rng: Rng) => btoa(String.fromCharCode(...Array.from({ length: 32 }, () => int(rng, 0, 255))));

function randomModel(rng: Rng): IndexFileModel<Body> {
  const users = ['alice', 'bob', 'carol'];
  const runs = users.flatMap((author) =>
    randomCase<Body>(rng, { author, homeserver: `hs${int(rng, 1, 2)}`, group: 'posts' }).runs.map((run) => ({
      ...run,
      entries: run.entries.map((entry): Entry<Body> => {
        if (entry.kind === 'tombstone') return entry;
        const hash = rng() < 0.5 ? base64Of(rng) : entry.hash;
        return hash === undefined
          ? { ...entry, data: { text: entry.path } }
          : { ...entry, hash, data: { text: entry.path } };
      }),
    })),
  );
  return {
    writer: `w${int(rng, 0, 999)}`,
    writtenAt: int(rng, 0, 2 ** 40),
    seed: 'alice',
    hops: int(rng, 0, 3),
    windowDays: int(rng, 0, 60) / 2,
    members: users.map((user, hop) => ({
      user,
      hop,
      homeserver: rng() < 0.3 ? null : { homeserver: rng() < 0.2 ? null : 'hs1', resolvedAt: int(rng, 0, 2 ** 40) },
    })),
    highWater: [{ homeserver: 'hs2', highWater: { cursor: BigInt(int(rng, 0, 1000)), author: 'carol' } }],
    runs,
  };
}

describe('index file codec', () => {
  it('reads back what it wrote, without data and with hashes cut to 16 bytes', async () => {
    for (let seed = 1; seed <= 50; seed += 1) {
      const model = randomModel(seeded(seed));
      const bytes = await encodeIndexFile(model);

      expect(await decodeIndexFile(bytes), `seed ${seed}`).toEqual(stripped(model));
      const [, , , , , , keys] = JSON.parse(gunzipJson(bytes)) as unknown[];
      expect(new Set(keys as string[]).size, `seed ${seed}`).toBe((keys as string[]).length);
    }
  });

  it('writes the pinned format', async () => {
    const bytes = await encodeIndexFile(FIXED);

    expect(gunzipJson(bytes)).toBe(FIXED_JSON);
    expect(await decodeIndexFile(gzipJson(fixedValue()))).toEqual(stripped(FIXED));
  });

  it('rejects truncated and non-gzip bytes', async () => {
    const bytes = await encodeIndexFile(FIXED);

    await expect(decodeIndexFile(bytes.slice(0, Math.floor(bytes.length / 2)))).rejects.toMatchObject({
      code: 'malformed',
    });
    await expect(decodeIndexFile(new TextEncoder().encode(FIXED_JSON))).rejects.toMatchObject({ code: 'malformed' });
    await expect(decodeIndexFile(gzipJson('not an index'))).rejects.toMatchObject({ code: 'malformed' });
  });

  it.each<[string, (value: unknown[]) => void]>([
    ['a writtenAt that is no number', (value) => (value[2] = '1700000000000')],
    ['a seed outside the key table', (value) => (value[3] = 3)],
    ['a repeated key', (value) => ((value[6] as unknown[])[2] = 'alice')],
    ['a high water author outside the key table', (value) => ((value[8] as unknown[][])[0][2] = -1)],
    ['a cursor with a leading zero', (value) => ((value[9] as unknown[][])[0][4] = '04')],
    ['a cursor above 64 bits', (value) => ((value[9] as unknown[][])[0][4] = '18446744073709551616')],
    ['an entry outside its run', (value) => ((value[9] as unknown[][][])[0][6] = [['bob', '5', 0]])],
    ['an entry of no kind', (value) => ((value[9] as unknown[][][])[0][6] = [['bob', '2', 2]])],
    ['a missing field', (value) => value.pop()],
  ])('rejects %s', async (_name, change) => {
    const value = fixedValue();
    change(value);

    await expect(decodeIndexFile(gzipJson(value))).rejects.toMatchObject({ name: 'IndexFileError', code: 'malformed' });
  });

  it('rejects an unknown version with its own code', async () => {
    const value = fixedValue();
    value[0] = 2;

    await expect(decodeIndexFile(gzipJson(value))).rejects.toMatchObject({ code: 'unknown-version' });
    await expect(decodeIndexFile(gzipJson([2]))).rejects.toMatchObject({ code: 'unknown-version' });
  });
});
