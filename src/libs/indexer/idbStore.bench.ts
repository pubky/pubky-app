import type { Entry, Run } from './indexer.types';
import { type BulkScopeReader, readScopesOf } from './readScopes';
import { comparePaths } from './run';
import type { IndexStore, ScopeKey } from './store.types';

// Not a test: bundled and run in a real browser by an external script, so it imports no test framework.

/** About 200 bytes once cloned, the size of a short post's reduced body. */
export interface BenchPayload {
  kind: string;
  content: string;
  createdAt: number;
  tags: string[];
}

export interface StoreBenchSizes {
  users: number;
  recordsPerUser: number;
  /** Users whose runs go in one `applyRuns`, as a crawl step commits them; 25 by default. */
  usersPerCommit?: number;
}

/** Wall times in ms. */
export interface StoreBenchTimings {
  records: number;
  scopes: number;
  /** Every run applied to the empty store, a commit per batch of users. */
  bulkApplyMs: number;
  /** The same commits again, which change nothing. */
  noopReapplyMs: number;
  /** Every scope read back, as a warm start reads them. */
  readScopesMs: number;
  /** One run of one new post on top of one scope. */
  incrementalApplyMs: number;
}

type BenchStore = IndexStore<BenchPayload> & Partial<BulkScopeReader<BenchPayload>>;

const KEY_ALPHABET = 'ybndrfg8ejkmcpqxot1uwisza345h769';
const ID_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const ROOT = '/pub/social/v1/';
const HOMESERVERS = 3;

/** A 52 character key, the same for the same seed. */
function fakeKey(seed: number): string {
  let state = seed >>> 0;
  let key = '';
  for (let i = 0; i < 52; i++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    key += KEY_ALPHABET[state >>> 27];
  }
  return key;
}

/** A 13 character timestamp-like id, distinct per `n`. */
function fakeId(n: number): string {
  let id = '';
  for (let rest = n; id.length < 13; rest = Math.floor(rest / 32)) id = ID_ALPHABET[rest % 32] + id;
  return id;
}

function payload(n: number): BenchPayload {
  const content = `Post number ${n} about indexing social data locally, with enough words to look like a short post. `;
  return { kind: 'short', content: content.padEnd(140, '.'), createdAt: 1700000000000 + n, tags: ['bench'] };
}

/** Builds the runs and scopes of `sizes`, cursors counting up from 1 across the whole fill. */
function fill({ users, recordsPerUser }: StoreBenchSizes) {
  let cursor = 0;
  const record = (path: string): Entry<BenchPayload> => {
    cursor += 1;
    return { kind: 'record', path, cursor: BigInt(cursor), hash: fakeKey(cursor), data: payload(cursor) };
  };
  const runOf = (scope: ScopeKey, entries: Entry<BenchPayload>[]): Run<BenchPayload> => ({
    ...scope,
    tail: BigInt(0),
    head: BigInt(cursor),
    entries: entries.sort((a, b) => comparePaths(a.path, b.path)),
  });

  const perUser: Run<BenchPayload>[][] = [];
  for (let user = 0; user < users; user++) {
    const author = fakeKey(user + 1);
    const homeserver = fakeKey(1000000 + (user % HOMESERVERS));
    const follows = Math.floor(recordsPerUser * 0.3);
    const graph = [record(`${ROOT}profile.json`)];
    for (let i = 1; i < follows; i++) graph.push(record(`${ROOT}follows/${fakeKey(2000000 + user * 10007 + i)}.json`));
    const activity: Entry<BenchPayload>[] = [];
    for (let i = graph.length; i < recordsPerUser; i++) {
      const id = fakeId(cursor + 1);
      activity.push(record(i % 10 < 7 ? `${ROOT}posts/${id}/post.json` : `${ROOT}tags/${id}.json`));
    }
    perUser.push([runOf({ author, homeserver, group: 'graph' }, graph)]);
    if (activity.length > 0) perUser[user].push(runOf({ author, homeserver, group: 'activity' }, activity));
  }
  return { perUser, next: () => cursor + 1 };
}

const elapsed = async (now: () => number, work: () => Promise<unknown>) => {
  const start = now();
  await work();
  return now() - start;
};

/**
 * Fills a fresh store from `open` with `sizes` of social-like records and times its main operations. The caller
 * disposes of the store it made.
 */
export async function benchIndexStore(
  open: () => BenchStore,
  sizes: StoreBenchSizes,
  now: () => number = () => performance.now(),
): Promise<StoreBenchTimings> {
  if (sizes.users < 1 || sizes.recordsPerUser < 1) throw new RangeError('the bench needs a user and a record');
  const store = open();
  const { perUser, next } = fill(sizes);
  const perCommit = sizes.usersPerCommit ?? 25;
  const commits: Run<BenchPayload>[][] = [];
  for (let i = 0; i < perUser.length; i += perCommit) commits.push(perUser.slice(i, i + perCommit).flat());
  const scopes: ScopeKey[] = perUser.flat().map(({ author, homeserver, group }) => ({ author, homeserver, group }));
  const applyAll = async () => {
    for (const runs of commits) await store.applyRuns(runs);
  };

  const bulkApplyMs = await elapsed(now, applyAll);
  const noopReapplyMs = await elapsed(now, applyAll);
  const readScopesMs = await elapsed(now, () => readScopesOf(store, scopes));

  const last = perUser[perUser.length - 1];
  const target = last[last.length - 1];
  const cursor = BigInt(next());
  const incremental: Run<BenchPayload> = {
    author: target.author,
    homeserver: target.homeserver,
    group: target.group,
    tail: target.head,
    head: cursor,
    entries: [{ kind: 'record', path: `${ROOT}posts/${fakeId(next())}/post.json`, cursor, data: payload(next()) }],
  };
  const incrementalApplyMs = await elapsed(now, () => store.applyRuns([incremental]));

  return {
    records: perUser.flat().reduce((sum, run) => sum + run.entries.length, 0),
    scopes: scopes.length,
    bulkApplyMs,
    noopReapplyMs,
    readScopesMs,
    incrementalApplyMs,
  };
}
