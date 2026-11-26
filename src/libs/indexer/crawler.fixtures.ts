import type { Schedule } from './concurrency';
import { createCrawler } from './crawler';
import type { CrawlerOptions } from './crawler.types';
import type { Domain } from './domain.types';
import { contentHash, FakeNetwork } from './fakeNetwork';
import type { Cursor } from './indexer.types';
import { createMemoryStore } from './memoryStore';
import type { IndexStore } from './store.types';
import type { IndexerTransport } from './transport.types';

// Test-only: a small social domain and a crawler wired to the fake network with a controllable clock.

export interface Post {
  text: string;
}

export const GRAPH = 'graph';
export const ACTIVITY = 'activity';
export const FOLLOWS = '/follows/';
export const POSTS = '/posts/';
export const DAY_MS = 24 * 60 * 60 * 1000;
export const NOW = Date.UTC(2026, 0, 31);

const POST_PATH = /^\/posts\/([0-9]+)$/;

const isPost = (value: unknown): value is Post =>
  typeof value === 'object' && value !== null && 'text' in value && typeof value.text === 'string';

export const testDomain: Domain<Post> = {
  groups: [
    { id: GRAPH, paths: [FOLLOWS], history: 'full' },
    { id: ACTIVITY, paths: [POSTS], history: 'window' },
  ],
  scopeGroup: GRAPH,
  linksOf: (live) => [...live.keys()].map((path) => path.slice(FOLLOWS.length)),
  needsBody: (path) => (path.startsWith(POSTS) ? 'render' : null),
  reduce: (_author, _path, bytes) => {
    try {
      const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
      return isPost(value) ? value : null;
    } catch {
      return null;
    }
  },
  timeOfPath: (path) => {
    const match = POST_PATH.exec(path);
    return match === null ? null : BigInt(match[1]);
  },
  matchesHash: (bytes, hash) => contentHash(bytes) === hash,
};

export const TAGS = '/tags/';

/**
 * The test domain with tags among the activity: a tag's file is fetched after its run commits. Payloads read back
 * from a saved index keep their data.
 */
export const taggedDomain: Domain<Post> = {
  ...testDomain,
  groups: [
    { id: GRAPH, paths: [FOLLOWS], history: 'full' },
    { id: ACTIVITY, paths: [POSTS, TAGS], history: 'window' },
  ],
  needsBody: (path) => (path.startsWith(POSTS) ? 'render' : path.startsWith(TAGS) ? 'later' : null),
  reviveData: (_author, _path, value) => (isPost(value) ? value : null),
};

/** The path of a post created `ageMs` before `NOW`, its id being the creation time in microseconds. */
export const postPath = (ageMs: number) => `${POSTS}${BigInt(NOW - ageMs) * BigInt(1000)}`;

/** `schedule` runs the request deadlines, real timers when absent. */
export function harness(options: Partial<CrawlerOptions> = {}, schedule?: Schedule) {
  const network = new FakeNetwork();
  const store = createMemoryStore<Post>();
  const clock = { now: NOW };
  const waits: number[] = [];
  const crawlerOf = (via: IndexerTransport) =>
    createCrawler<Post>({
      transport: via,
      store,
      domain: testDomain,
      now: () => clock.now,
      sleep: async (ms) => {
        waits.push(ms);
        clock.now += ms;
      },
      schedule,
      options,
    });
  return { network, store, clock, waits, crawler: crawlerOf(network), crawlerOf };
}

/** Path to cursor of every record the store serves for the scope. */
export async function served(
  store: IndexStore<Post>,
  author: string,
  homeserver: string,
  group: string,
): Promise<Map<string, Cursor>> {
  const { live } = await store.readScope({ author, homeserver, group });
  return new Map([...live].map(([path, record]): [string, Cursor] => [path, record.cursor]));
}

/** Path to payload of every record the store serves for the scope, `undefined` for a record without data. */
export async function servedData(
  store: IndexStore<Post>,
  author: string,
  homeserver: string,
  group: string,
): Promise<Map<string, Post | undefined>> {
  const { live } = await store.readScope({ author, homeserver, group });
  return new Map([...live].map(([path, record]): [string, Post | undefined] => [path, record.data]));
}
