// @vitest-environment node
import { gunzipSync, gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { shortHash } from './hash';
import { InvalidIndexInputError } from './indexer.errors';
import type { Entry, Run } from './indexer.types';
import { decodeIndexFile, encodeIndexFile, type IndexFileModel, type ReviveData } from './indexFile';
import { int, randomCase, type Rng, seeded } from './merge.generators';

interface Body {
  text: string;
}

const FULL = 'AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyA=';

const FIXED: IndexFileModel<Body> = {
  part: {
    kind: 'hot',
    shards: 4,
    folded: [{ writer: 'w2', gen: 3 }],
    packs: [{ bucket: 1, bytes: 2048, authors: 2, writtenAt: 1699999990000 }],
    cut: [{ homeserver: 'hs1', cursor: BigInt(5) }],
  },
  writer: 'w1',
  writtenAt: 1700000000000,
  seed: 'alice',
  hops: 2,
  windowDays: 30,
  members: [
    { user: 'alice', hop: 0, homeserver: { homeserver: 'hs1', resolvedAt: 1699999999000 } },
    { user: 'bob', hop: 1, homeserver: null },
  ],
  homeservers: [{ homeserver: 'hs1', epoch: 1, highWater: { cursor: BigInt(9), author: 'bob' } }],
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

const RUNS_JSON =
  '[[0,1,"graph","0","4","/follows/",[["bob","2",0],["carol","4",1]]],' +
  '[2,1,"activity","5","9","",[["/posts/1","9",0,"AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyA=",{"text":"hi"}]]]]';

// The reference vector of format version 3, for a reader in any language: FIXED gunzipped.
const FIXED_JSON =
  '[3,"hot","w1",1700000000000,0,2,30,["alice","hs1","bob"],[[0,0,1,1699999999000],[2,1]],[[1,1,"9",2]],' +
  `${RUNS_JSON},[4,[["w2",3]],[[1,2048,2,1699999990000]],[[1,"5"]]]]`;

// Version 2, one file per writer, which earlier releases wrote: no kind, no extra, marks without an epoch.
const VERSION_2_JSON =
  '[2,"w1",1700000000000,0,2,30,["alice","hs1","bob"],[[0,0,1,1699999999000],[2,1]],[[1,"9",2]],' + `${RUNS_JSON}]`;

/** FIXED as a version 2 file reads. */
const FIXED_V2: IndexFileModel<Body> = {
  ...FIXED,
  part: { kind: 'single' },
  homeservers: [{ homeserver: 'hs1', epoch: 0, highWater: { cursor: BigInt(9), author: 'bob' } }],
};

// Version 1, which the format still reads: records without data, hashes cut to 16 bytes.
const VERSION_1_JSON =
  '[1,"w1",1700000000000,0,2,30,["alice","hs1","bob"],[[0,0,1,1699999999000],[2,1]],[[1,"9",2]],' +
  '[[0,1,"graph","0","4","/follows/",[["bob","2",0],["carol","4",1]]],' +
  '[2,1,"activity","5","9","",[["/posts/1","9",0,"AQIDBAUGBwgJCgsMDQ4PEA=="]]]]]';

const isBody = (value: unknown): value is Body =>
  typeof value === 'object' && value !== null && 'text' in value && typeof value.text === 'string';
const revive: ReviveData<Body> = (_author, _path, value) => (isBody(value) ? value : null);

const gunzipJson = (bytes: Uint8Array): string => gunzipSync(bytes).toString('utf8');
const gzipJson = (value: unknown): Uint8Array => new Uint8Array(gzipSync(JSON.stringify(value)));
const fixedValue = (): unknown[] => JSON.parse(FIXED_JSON) as unknown[];

/**
 * What a reader without a reviver gets back for a model: no data; a record written with data keeps its whole hash,
 * one without has it cut to 16 bytes.
 */
function stripped<D>(model: IndexFileModel<D>): IndexFileModel {
  const runs = model.runs.map((run): Run<never> => ({
    ...run,
    entries: run.entries.map((entry): Entry<never> => {
      if (entry.kind === 'tombstone') return entry;
      if (entry.hash === undefined) return { kind: 'record', path: entry.path, cursor: entry.cursor };
      const hash = entry.data === undefined ? shortHash(entry.hash) : entry.hash;
      return { kind: 'record', path: entry.path, cursor: entry.cursor, hash };
    }),
  }));
  return { ...model, runs };
}

/** What a reader with a reviver gets back: the data too. */
function revived<D>(model: IndexFileModel<D>): IndexFileModel<D> {
  const runs = model.runs.map((run): Run<D> => ({
    ...run,
    entries: run.entries.map((entry): Entry<D> => {
      if (entry.kind === 'tombstone' || entry.data !== undefined || entry.hash === undefined) return entry;
      return { ...entry, hash: shortHash(entry.hash) };
    }),
  }));
  return { ...model, runs };
}

const base64Of = (rng: Rng) => btoa(String.fromCharCode(...Array.from({ length: 32 }, () => int(rng, 0, 255))));

const PARTS: ReadonlyArray<(rng: Rng) => IndexFileModel['part']> = [
  (rng) => ({ kind: 'delta', gen: int(rng, 1, 99), base: int(rng, 0, 9) }),
  (rng) => ({ kind: 'pack', shards: 8, bucket: int(rng, 0, 7) }),
  (rng) => ({
    kind: 'hot',
    shards: 0,
    folded: [{ writer: `w${int(rng, 0, 9)}`, gen: int(rng, 0, 99) }],
    packs: [],
    cut: rng() < 0.5 ? [] : [{ homeserver: 'hs2', cursor: BigInt(int(rng, 0, 99)) }],
  }),
];

function randomModel(rng: Rng): IndexFileModel<Body> {
  const users = ['alice', 'bob', 'carol'];
  const runs = users.flatMap((author) =>
    randomCase<Body>(rng, { author, homeserver: `hs${int(rng, 1, 2)}`, group: 'posts' }).runs.map((run) => ({
      ...run,
      entries: run.entries.map((entry): Entry<Body> => {
        if (entry.kind === 'tombstone') return entry;
        const hash = rng() < 0.5 ? base64Of(rng) : entry.hash;
        const record = { kind: 'record' as const, path: entry.path, cursor: entry.cursor };
        const withHash = hash === undefined ? record : { ...record, hash };
        return rng() < 0.5 ? withHash : { ...withHash, data: { text: entry.path } };
      }),
    })),
  );
  return {
    part: PARTS[int(rng, 0, PARTS.length - 1)](rng),
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
    homeservers: [
      { homeserver: 'hs2', epoch: int(rng, 0, 3), highWater: { cursor: BigInt(int(rng, 0, 1000)), author: 'carol' } },
      { homeserver: 'hs1', epoch: int(rng, 0, 3), highWater: null },
    ],
    runs,
  };
}

describe('index file codec', () => {
  it('reads back what it wrote, data through the reviver, and pointer hashes cut to 16 bytes', async () => {
    for (let seed = 1; seed <= 50; seed += 1) {
      const model = randomModel(seeded(seed));
      const bytes = await encodeIndexFile(model);

      expect(await decodeIndexFile(bytes, revive), `seed ${seed}`).toEqual(revived(model));
      expect(await decodeIndexFile(bytes), `seed ${seed}`).toEqual(stripped(model));
      const [, , , , , , , keys] = JSON.parse(gunzipJson(bytes)) as unknown[];
      expect(new Set(keys as string[]).size, `seed ${seed}`).toBe((keys as string[]).length);
    }
  });

  it('writes the pinned format', async () => {
    const bytes = await encodeIndexFile(FIXED);

    expect(gunzipJson(bytes)).toBe(FIXED_JSON);
    expect(await decodeIndexFile(gzipJson(fixedValue()), revive)).toEqual(FIXED);
    expect(await decodeIndexFile(gzipJson(fixedValue()))).toEqual(stripped(FIXED));
  });

  it('still reads version 2, each mark at epoch 0', async () => {
    expect(await decodeIndexFile(gzipJson(JSON.parse(VERSION_2_JSON)), revive)).toEqual(FIXED_V2);
  });

  it('refuses to write a version 2 file', async () => {
    await expect(encodeIndexFile(FIXED_V2)).rejects.toBeInstanceOf(InvalidIndexInputError);
  });

  it('still reads version 1, pointers without data', async () => {
    const read = await decodeIndexFile(gzipJson(JSON.parse(VERSION_1_JSON)), revive);

    expect(read).toEqual(revived({ ...FIXED_V2, runs: stripped(FIXED).runs }));
    expect(read.runs[1].entries).toEqual([
      { kind: 'record', path: '/posts/1', cursor: BigInt(9), hash: 'AQIDBAUGBwgJCgsMDQ4PEA==' },
    ]);
  });

  it('loads a record whose payload the reviver refuses without data, keeping its whole hash', async () => {
    const value = fixedValue();
    ((value[10] as unknown[][])[1][6] as unknown[][])[0][4] = { text: 42 };

    const read = await decodeIndexFile(gzipJson(value), revive);

    expect(read.runs[1].entries).toEqual([{ kind: 'record', path: '/posts/1', cursor: BigInt(9), hash: FULL }]);
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
    ['a writtenAt that is no number', (value) => (value[3] = '1700000000000')],
    ['a seed outside the key table', (value) => (value[4] = 3)],
    ['a repeated key', (value) => ((value[7] as unknown[])[2] = 'alice')],
    ['a high water author outside the key table', (value) => ((value[9] as unknown[][])[0][3] = -1)],
    ['an epoch that is no count', (value) => ((value[9] as unknown[][])[0][1] = -1)],
    ['a cursor with a leading zero', (value) => ((value[10] as unknown[][])[0][4] = '04')],
    ['a cursor above 64 bits', (value) => ((value[10] as unknown[][])[0][4] = '18446744073709551616')],
    ['an entry outside its run', (value) => ((value[10] as unknown[][][])[0][6] = [['bob', '5', 0]])],
    ['an entry of no kind', (value) => ((value[10] as unknown[][][])[0][6] = [['bob', '2', 2]])],
    ['a missing field', (value) => value.pop()],
    ['a hash that is no string', (value) => (((value[10] as unknown[][])[1][6] as unknown[][])[0][3] = 7)],
    ['a record of six fields', (value) => ((value[10] as unknown[][][])[0][6] = [['bob', '2', 0, null, {}, 1]])],
    ['an unknown kind', (value) => (value[1] = 'cold')],
    ['shards that are no power of two', (value) => ((value[11] as unknown[])[0] = 3)],
    ['a pack bucket outside the shards', (value) => ((value[11] as unknown[][][])[2][0][0] = 4)],
    ['a folded writer twice', (value) => (value[11] as unknown[][])[1].push(['w2', 1])],
    ['a pack of no shards', (value) => ((value[1] = 'pack'), (value[11] = [0, 0]))],
    ['a delta of no generation', (value) => ((value[1] = 'delta'), (value[11] = ['1', 0]))],
  ])('rejects %s', async (_name, change) => {
    const value = fixedValue();
    change(value);

    await expect(decodeIndexFile(gzipJson(value))).rejects.toMatchObject({ name: 'IndexFileError', code: 'malformed' });
  });

  it('rejects an unknown version with its own code, and data in a version 1 file', async () => {
    const value = fixedValue();
    value[0] = 4;

    await expect(decodeIndexFile(gzipJson(value))).rejects.toMatchObject({ code: 'unknown-version' });
    await expect(decodeIndexFile(gzipJson([4]))).rejects.toMatchObject({ code: 'unknown-version' });
    const old = JSON.parse(VERSION_2_JSON) as unknown[];
    old[0] = 1;
    await expect(decodeIndexFile(gzipJson(old))).rejects.toMatchObject({ code: 'malformed' });
  });
});
