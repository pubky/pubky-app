import { createCrawler } from './crawler';
import type { CrawlerOptions } from './crawler.types';
import type { Domain } from './domain.types';
import { contentHash, FakeNetwork } from './fakeNetwork';
import type { Cursor } from './indexer.types';
import { createMemoryStore } from './memoryStore';
import { mergeRuns } from './merge';
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
  needsBody: (path) => path.startsWith(POSTS),
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

/** The path of a post created `ageMs` before `NOW`, its id being the creation time in microseconds. */
export const postPath = (ageMs: number) => `${POSTS}${BigInt(NOW - ageMs) * BigInt(1000)}`;

export function harness(options: Partial<CrawlerOptions> = {}) {
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
  const { live } = mergeRuns(await store.readRuns({ author, homeserver, group }));
  return new Map([...live].map(([path, record]): [string, Cursor] => [path, record.cursor]));
}

/** Path to payload of every record the store serves for the scope, `undefined` for a record without data. */
export async function servedData(
  store: IndexStore<Post>,
  author: string,
  homeserver: string,
  group: string,
): Promise<Map<string, Post | undefined>> {
  const { live } = mergeRuns(await store.readRuns({ author, homeserver, group }));
  return new Map([...live].map(([path, record]): [string, Post | undefined] => [path, record.data]));
}
