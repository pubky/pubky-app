import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { postStreamQueue } from '@/application/stream/posts/muting/post-stream-queue';
import { NEXUS_POSTS_PER_PAGE } from '@/config/nexus';
import { StreamPostsController } from '@/controllers/stream/posts/posts';
import type { Pubky } from '@/models/models.types';
import { PostDetailsModel } from '@/models/post/details/postDetails';
import { DELETED } from '@/models/post/details/postDetails.constants';
import { buildSortedAuthorStreamId, type PostStreamId, PostStreamTypes } from '@/models/stream/post/postStream.types';
import { UserStreamTypes } from '@/models/stream/user/userStream.types';
import { LocalStreamPostsService } from '@/services/local/stream/posts/posts';
import { LocalStreamUsersService } from '@/services/local/stream/users/users';
import type { NexusPost, NexusPostsKeyStream } from '@/services/nexus/nexus.types';
import { StreamSorting } from '@/services/nexus/nexus.types';
import { NexusPostStreamService } from '@/services/nexus/stream/posts/postStream';
import { StreamSource } from '@/services/nexus/stream/posts/postStream.types';
import { NexusUserStreamService } from '@/services/nexus/stream/users/userStream';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useStreamPagination } from './useStreamPagination';

/**
 * Stream pagination against a simulated Nexus, end to end: the real hook drives the real
 * controller, application, queue and local services on fake-indexeddb. Only the two Nexus
 * read services are replaced, by a model of Nexus's stream semantics.
 *
 * Every mutation happens on the simulated Nexus and reaches the client only the way it
 * reaches a second user's client in production: through stream pages, through cache-miss
 * hydration, through the TTL refresh write (`persistPosts` with a refresh guard), through a
 * bootstrap row replacement, through a coordinator head poll merged on the next refresh, and
 * through pages another tab of the same user appended to the shared row. The client never
 * mutates its own stream rows here.
 *
 * Nexus model (verified against production data for #2523): a timeline stream is ordered by
 * score, the post's original index time; editing or deleting a post bumps `indexed_at` but
 * leaves the score untouched; `start` is an inclusive upper bound, `end` an inclusive lower
 * bound; `last_post_score` is the score of the last returned post. A deleted post that still
 * has replies stays in the stream as a `[DELETED]` tombstone; a purged post vanishes from the
 * stream and from the by-ids endpoint.
 *
 * Invariants checked at the end of every walk (mount or refresh → `hasMore === false`):
 *  1. Completeness: every post that is visible at the end and sits at or below the walk's
 *     head score was delivered. Posts deleted during the walk may be delivered or not.
 *  2. Nothing invented: every delivered id exists, none belongs to a muted author, none is
 *     delivered twice.
 *  3. Stream order: delivered ids descend by score.
 *  4. Bounded work: Nexus page requests and load rounds stay within the page count plus a
 *     small allowance per seam-creating event. A loop or a re-served region blows past it.
 *
 * Randomized runs are seeded, so a failure names the seed that reproduces it.
 */

const VIEWER = 'viewer' as Pubky;
const MUTED = 'muted-author' as Pubky;
const AUTHORS = ['alice', 'bob', 'carol'] as Pubky[];
const LIMIT = NEXUS_POSTS_PER_PAGE;
const TIMELINE: PostStreamId = PostStreamTypes.TIMELINE_ALL_ALL;
const PROFILE: PostStreamId = buildSortedAuthorStreamId(StreamSorting.TIMELINE, AUTHORS[0], 'all');

type SimPost = { id: string; raw: string; author: Pubky; score: number; indexedAt: number; content: string };

/** Seeded PRNG (mulberry32) so a failing run is reproducible from its seed. */
const prng = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

class SimNexus {
  readonly posts = new Map<string, SimPost>();
  /** Ids ever tombstoned or purged: a walk may or may not deliver them. */
  readonly deletedEver = new Set<string>();
  readonly purged = new Set<string>();
  pageCalls = 0;
  private clock: number;
  private seq = 0;

  constructor(base: number) {
    this.clock = base;
  }

  private tick(): number {
    this.clock += 1;
    return this.clock;
  }

  publish(author: Pubky): SimPost {
    this.seq += 1;
    const raw = `p${this.seq}`;
    const score = this.tick();
    const post = { id: `${author}:${raw}`, raw, author, score, indexedAt: score, content: `Post ${raw}` };
    this.posts.set(post.id, post);
    return post;
  }

  edit(id: string): void {
    const post = this.posts.get(id)!;
    post.indexedAt = this.tick();
    post.content = `${post.content} (edited)`;
  }

  tombstone(id: string): void {
    const post = this.posts.get(id)!;
    post.indexedAt = this.tick();
    post.content = DELETED;
    this.deletedEver.add(id);
  }

  purge(id: string): void {
    this.purged.add(id);
    this.deletedEver.add(id);
  }

  /** The stream as Nexus orders it: by score, descending. */
  stream(author?: Pubky): SimPost[] {
    return [...this.posts.values()]
      .filter((post) => !this.purged.has(post.id) && (author === undefined || post.author === author))
      .sort((a, b) => b.score - a.score);
  }

  topScore(author?: Pubky): number {
    return this.stream(author)[0]?.score ?? 0;
  }

  page(
    { start, end, limit }: { start?: number; end?: number; limit: number },
    author?: Pubky,
    countAsClientCall = true,
  ): NexusPostsKeyStream {
    if (countAsClientCall) this.pageCalls += 1;
    const keys = this.stream(author)
      .filter((post) => (start === undefined || post.score <= start) && (end === undefined || post.score >= end))
      .slice(0, limit);
    return {
      post_keys: keys.map((post) => post.id),
      last_post_score: keys.length > 0 ? keys[keys.length - 1].score : null,
    };
  }

  byIds(ids: string[]): NexusPost[] {
    return ids
      .map((id) => this.posts.get(id))
      .filter((post): post is SimPost => post !== undefined && !this.purged.has(post.id))
      .map((post) => ({
        details: {
          id: post.raw,
          content: post.content,
          kind: 'short',
          uri: `pubky://${post.author}/pub/pubky.app/posts/${post.raw}`,
          author: post.author,
          indexed_at: post.indexedAt,
          attachments: null,
        },
        counts: { replies: 0, tags: 0, unique_tags: 0, reposts: 0 },
        tags: [],
        relationships: { replied: null, reposted: null, mentioned: [] },
        bookmark: null,
      }));
  }
}

const authorOf = (streamId: PostStreamId): Pubky | undefined => (streamId === PROFILE ? AUTHORS[0] : undefined);

// ---------------------------------------------------------------------------------------------
// Client-side propagation, each mirroring the production code path that performs it
// ---------------------------------------------------------------------------------------------

/** `TtlApplication.refreshPosts`: rewrite locally known posts from Nexus behind the refresh guard. */
const ttlRefresh = async (sim: SimNexus, ids: string[]) => {
  const local = await PostDetailsModel.findByIdsPreserveOrder(ids);
  const known = ids.filter((_, index) => local[index] !== undefined);
  if (known.length === 0) return;
  await LocalStreamPostsService.persistPosts({
    posts: sim.byIds(known),
    refreshGuard: { fetchStartedAt: Date.now() + 1 },
  });
};

/**
 * `BootstrapApplication`: replace the All timeline row with the head page (no cursor) and
 * clear the unread row it supersedes.
 */
const bootstrap = async (sim: SimNexus) => {
  const head = sim.stream().slice(0, LIMIT);
  await LocalStreamPostsService.persistPosts({ posts: sim.byIds(head.map((post) => post.id)) });
  await LocalStreamPostsService.upsert({ streamId: TIMELINE, stream: head.map((post) => post.id) });
  await LocalStreamPostsService.clearUnreadStream({ streamId: TIMELINE });
};

/** `StreamCoordinator.poll`: fetch above the cached head into the unread row. */
const headPoll = async (streamId: PostStreamId) => {
  const streamHead = await StreamPostsController.getStreamHead({ streamId });
  if (streamHead === 0) return;
  await StreamPostsController.getOrFetchStreamSlice({ streamId, streamHead, limit: LIMIT });
};

/** Another tab of the same user paginated one page deeper into the shared row. */
const otherTabPaginates = async (sim: SimNexus, streamId: PostStreamId) => {
  const row = await LocalStreamPostsService.read({ streamId });
  if (row?.tailCursor === undefined) return;
  const page = sim.page({ start: row.tailCursor - 1, limit: LIMIT }, authorOf(streamId), false);
  if (page.post_keys.length === 0) return;
  await LocalStreamPostsService.persistPosts({ posts: sim.byIds(page.post_keys) });
  await LocalStreamPostsService.persistNewStreamChunk({
    streamId,
    stream: page.post_keys,
    tailCursor: page.last_post_score ?? undefined,
  });
};

/**
 * `PostStreamApplication.prepareStreamForInitialLoad` in another tab: an expired or dirty stream
 * has its row and unread row deleted before that tab fetches the replacement. The mounted walk
 * loses every cached id it has not consumed; the allowance covers fetching them again.
 */
const otherTabClearsRow = async (feed: Feed, streamId: PostStreamId): Promise<number> => {
  const row = await LocalStreamPostsService.read({ streamId });
  const delivered = new Set(feed.result.current.postIds);
  const lost = row?.stream.filter((id) => !delivered.has(id)).length ?? 0;
  await Promise.all([
    LocalStreamPostsService.deleteById({ streamId }),
    LocalStreamPostsService.clearUnreadStream({ streamId }),
  ]);
  return Math.ceil(lost / LIMIT) + 1;
};

// ---------------------------------------------------------------------------------------------
// Walk driver and invariants
// ---------------------------------------------------------------------------------------------

type Feed = ReturnType<typeof renderHook<ReturnType<typeof useStreamPagination>, unknown>>;

const mountFeed = (streamId: PostStreamId): Feed => renderHook(() => useStreamPagination({ streamId }));

const settled = async (feed: Feed) => {
  await waitFor(() => {
    expect(feed.result.current.loading).toBe(false);
    expect(feed.result.current.loadingMore).toBe(false);
  });
  expect(feed.result.current.error, 'feed reported an error').toBeNull();
};

const loadMore = async (feed: Feed) => {
  await act(async () => {
    await feed.result.current.loadMore();
  });
};

const refresh = async (feed: Feed) => {
  await act(async () => {
    await feed.result.current.refresh();
  });
};

type WalkEvents = {
  /**
   * Called before every load round; returns the page allowance its events earn. A row seeded
   * without a cursor may cost one duplicate page and one partial-hit top-up; a bootstrap that
   * replaces the row mid-walk also loses the walked region, which is fetched again.
   */
  beforeRound?: (round: number) => Promise<{ seamCost: number; headPolls: number }>;
};

type Walk = {
  rounds: number;
  pageCalls: number;
  seamCost: number;
  headPolls: number;
  headScore: number;
  maxLength: number;
};

/**
 * The score the client's walk starts from: its cached row head when it has one (a refresh
 * re-reads the cache; newer posts arrive through head polls, not through the walk), else the
 * top of the stream it is about to fetch.
 */
const clientHeadScore = async (sim: SimNexus, streamId: PostStreamId): Promise<number> => {
  const row = await LocalStreamPostsService.read({ streamId });
  const head = row?.stream[0];
  return head !== undefined ? sim.posts.get(head)!.score : sim.topScore(authorOf(streamId));
};

/**
 * Drives `loadMore` until the stream ends, applying `events` between rounds. `initialSeamCost`
 * is the allowance for a cursor-less row the walk starts on (a warm cache or a bootstrap).
 */
const walkToEnd = async (
  feed: Feed,
  sim: SimNexus,
  streamId: PostStreamId,
  events: WalkEvents = {},
  initialSeamCost = 0,
): Promise<Walk> => {
  const author = authorOf(streamId);
  const walk: Walk = {
    rounds: 0,
    pageCalls: sim.pageCalls,
    seamCost: initialSeamCost,
    headPolls: 0,
    headScore: await clientHeadScore(sim, streamId),
    maxLength: sim.stream(author).length,
  };
  const maxRounds = Math.ceil(walk.maxLength / LIMIT) + 40;
  while (feed.result.current.hasMore) {
    if (walk.rounds > maxRounds) {
      throw new Error(`walk did not end within ${maxRounds} rounds (delivered ${feed.result.current.postIds.length})`);
    }
    const applied = await events.beforeRound?.(walk.rounds);
    walk.seamCost += applied?.seamCost ?? 0;
    walk.headPolls += applied?.headPolls ?? 0;
    walk.maxLength = Math.max(walk.maxLength, sim.stream(author).length);
    await loadMore(feed);
    expect(feed.result.current.error, `round ${walk.rounds} reported an error`).toBeNull();
    walk.rounds += 1;
  }
  walk.pageCalls = sim.pageCalls - walk.pageCalls;
  return walk;
};

const expectWalkInvariants = (feed: Feed, sim: SimNexus, streamId: PostStreamId, walk: Walk, label: string) => {
  const author = authorOf(streamId);
  const delivered = feed.result.current.postIds;
  const muted = streamId === TIMELINE ? new Set<string>([MUTED]) : new Set<string>();

  // 1. Completeness.
  const expected = sim
    .stream(author)
    .filter((post) => post.score <= walk.headScore && !sim.deletedEver.has(post.id) && !muted.has(post.author))
    .map((post) => post.id);
  const missing = expected.filter((id) => !delivered.includes(id));
  expect(missing, `${label}: visible posts never delivered`).toEqual([]);

  // 2. Nothing invented.
  const unknown = delivered.filter((id) => !sim.posts.has(id));
  expect(unknown, `${label}: delivered ids that do not exist`).toEqual([]);
  const mutedDelivered = delivered.filter((id) => muted.has(sim.posts.get(id)!.author));
  expect(mutedDelivered, `${label}: delivered posts from a muted author`).toEqual([]);
  expect(new Set(delivered).size, `${label}: duplicate ids delivered`).toBe(delivered.length);

  // 3. Stream order.
  const scores = delivered.map((id) => sim.posts.get(id)!.score);
  const outOfOrder = scores.findIndex((score, index) => index > 0 && score > scores[index - 1]);
  const around = delivered.slice(Math.max(0, outOfOrder - 3), outOfOrder + 3).join(' ');
  expect(outOfOrder, `${label}: delivered out of stream order at index ${outOfOrder}: ${around}`).toBe(-1);

  // 4. Bounded work: the page count, the empty end page, the seam allowance earned by the
  // events (see `WalkEvents`), one request per head poll, and a little slack.
  const pages = Math.ceil(walk.maxLength / LIMIT);
  const stats = JSON.stringify(walk);
  const pageBudget = pages + 1 + walk.seamCost + walk.headPolls + 3;
  expect(walk.pageCalls, `${label}: Nexus page requests ${stats}`).toBeLessThanOrEqual(pageBudget);
  expect(walk.rounds, `${label}: load rounds ${stats}`).toBeLessThanOrEqual(pages + walk.seamCost + walk.headPolls + 5);
};

// ---------------------------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------------------------

/** Scores must read as fresh, or the initial load drops the row as stale (`streamCacheMaxAgeMs`). */
const newSim = () => new SimNexus(Date.now() - 60_000);

const seedStream = (sim: SimNexus, count: number, pick: () => Pubky) => {
  for (let i = 0; i < count; i += 1) sim.publish(pick());
};

const wireNexus = (sim: SimNexus) => {
  vi.spyOn(NexusPostStreamService, 'fetch').mockImplementation(async ({ invokeEndpoint, params, extraParams }) =>
    sim.page(
      { start: params.start, end: params.end, limit: params.limit ?? LIMIT },
      // Only author streams scope by author; other streams carry a placeholder author_id.
      invokeEndpoint === StreamSource.AUTHOR ? (extraParams?.author_id as Pubky | undefined) : undefined,
    ),
  );
  vi.spyOn(NexusPostStreamService, 'fetchByIds').mockImplementation(async ({ post_ids }) => sim.byIds(post_ids));
  vi.spyOn(NexusUserStreamService, 'fetchByIds').mockResolvedValue([]);
};

/** A cached first page from an earlier session: the row exists, without a persisted cursor. */
const warmCache = async (sim: SimNexus, streamId: PostStreamId) => {
  const head = sim.stream(authorOf(streamId)).slice(0, LIMIT);
  await LocalStreamPostsService.persistPosts({ posts: sim.byIds(head.map((post) => post.id)) });
  await LocalStreamPostsService.upsert({ streamId, stream: head.map((post) => post.id) });
};

describe('useStreamPagination against a simulated Nexus (remote-origin mutations)', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    postStreamQueue.clear();
    useAuthStore.setState({ currentUserPubky: VIEWER });
    await LocalStreamUsersService.upsert({ streamId: UserStreamTypes.MUTED, stream: [MUTED] });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('pages past posts edited below the cached tail after a TTL refresh rewrote their indexed_at (#2523)', async () => {
    const sim = newSim();
    seedStream(sim, 40, () => AUTHORS[1]);
    wireNexus(sim);
    await warmCache(sim, TIMELINE);
    const feed = mountFeed(TIMELINE);
    await settled(feed);

    const editBelowTail = async (round: number) => {
      if (round !== 1) return { seamCost: 0, headPolls: 0 };
      // Another user edits the ten posts right below the cached page, and this client's
      // TTL refresh writes their bumped indexed_at before the walk reaches them.
      const below = sim.stream().slice(LIMIT, LIMIT * 2);
      below.forEach((post) => sim.edit(post.id));
      await ttlRefresh(
        sim,
        [...sim.stream().slice(0, LIMIT), ...below].map((post) => post.id),
      );
      return { seamCost: 0, headPolls: 0 };
    };
    const walk = await walkToEnd(feed, sim, TIMELINE, { beforeRound: editBelowTail }, 2);

    expectWalkInvariants(feed, sim, TIMELINE, walk, 'edited below tail');
  });

  it('pages a profile past tombstones re-indexed after the cache was warmed (#1569)', async () => {
    const sim = newSim();
    seedStream(sim, 45, () => AUTHORS[0]);
    wireNexus(sim);
    await warmCache(sim, PROFILE);
    // The author deletes a run of posts below the cached page; they stay in the stream as
    // tombstones with a newer indexed_at than everything cached.
    sim
      .stream(AUTHORS[0])
      .slice(LIMIT, LIMIT + 25)
      .forEach((post) => sim.tombstone(post.id));
    const feed = mountFeed(PROFILE);
    await settled(feed);

    const walk = await walkToEnd(feed, sim, PROFILE, {}, 2);

    expectWalkInvariants(feed, sim, PROFILE, walk, 'profile tombstones');
    expect(feed.result.current.postIds).toHaveLength(20);
  });

  it('survives a bootstrap replacing the All timeline row mid-walk', async () => {
    const sim = newSim();
    seedStream(sim, 60, () => AUTHORS[2]);
    wireNexus(sim);
    const feed = mountFeed(TIMELINE);
    await settled(feed);

    const walk = await walkToEnd(feed, sim, TIMELINE, {
      beforeRound: async (round) => {
        if (round !== 2) return { seamCost: 0, headPolls: 0 };
        sim.publish(AUTHORS[2]);
        await bootstrap(sim);
        return { seamCost: round + 2, headPolls: 0 };
      },
    });

    expectWalkInvariants(feed, sim, TIMELINE, walk, 'bootstrap mid-walk');
  });

  // Known gap, tracked in #2570: another tab paginated the shared row two pages past what this
  // reader consumed, then an initial load elsewhere found the row expired and deleted it. The
  // reader's carried cursor is the vanished row's tail, below twenty ids it never served, and
  // the walk resumes there. A resume seeded from local timestamps was reviewed and rejected
  // (it falls open to a post's creation time on an emptied Bookmarks row, aligns against a row
  // this walk did not build, and trusts a locally authored post's timestamp before its first
  // refresh); the fix belongs with the non-atomic row rebuild in `prepareStreamForInitialLoad`.
  it.fails('survives another tab clearing the row mid-walk without skipping unconsumed cached ids', async () => {
    const sim = newSim();
    seedStream(sim, 60, () => AUTHORS[2]);
    wireNexus(sim);
    const feed = mountFeed(TIMELINE);
    await settled(feed);

    const walk = await walkToEnd(feed, sim, TIMELINE, {
      beforeRound: async (round) => {
        if (round === 0) {
          await otherTabPaginates(sim, TIMELINE);
          await otherTabPaginates(sim, TIMELINE);
          return { seamCost: 4, headPolls: 0 };
        }
        if (round === 1) return { seamCost: await otherTabClearsRow(feed, TIMELINE), headPolls: 0 };
        return { seamCost: 0, headPolls: 0 };
      },
    });

    expectWalkInvariants(feed, sim, TIMELINE, walk, 'other tab clears the row');
  });

  it('never serves posts above the feed head from a bootstrap row whose tail was edited later', async () => {
    const sim = newSim();
    seedStream(sim, 40, () => AUTHORS[1]);
    wireNexus(sim);
    await bootstrap(sim); // the newest ten posts, no cursor
    const tail = sim.stream()[LIMIT - 1];
    const newer = [sim.publish(AUTHORS[2]), sim.publish(AUTHORS[0])];
    sim.edit(tail.id);
    await ttlRefresh(sim, [tail.id]); // the bumped indexed_at reaches this client
    const feed = mountFeed(TIMELINE);
    await settled(feed);

    const walk = await walkToEnd(feed, sim, TIMELINE, {}, 2);

    expectWalkInvariants(feed, sim, TIMELINE, walk, 'edited bootstrap tail');
    newer.forEach((post) => expect(feed.result.current.postIds).not.toContain(post.id));
  });

  it('continues through pages another tab appended to the shared row', async () => {
    const sim = newSim();
    seedStream(sim, 60, () => AUTHORS[1]);
    wireNexus(sim);
    const feed = mountFeed(TIMELINE);
    await settled(feed);

    const walk = await walkToEnd(feed, sim, TIMELINE, {
      beforeRound: async (round) => {
        if (round % 2 !== 1) return { seamCost: 0, headPolls: 0 };
        await otherTabPaginates(sim, TIMELINE);
        return { seamCost: 2, headPolls: 0 };
      },
    });

    expectWalkInvariants(feed, sim, TIMELINE, walk, 'other tab paginates');
  });

  it('merges head-polled posts on refresh and walks the new stream to the end', async () => {
    const sim = newSim();
    seedStream(sim, 30, () => AUTHORS[1]);
    wireNexus(sim);
    const feed = mountFeed(TIMELINE);
    await settled(feed);
    const first = await walkToEnd(feed, sim, TIMELINE);
    expectWalkInvariants(feed, sim, TIMELINE, first, 'first walk');

    // New posts arrive above the head, one of them edited before the poll; the poll lands
    // them in the unread row and the refresh merges them.
    const fresh = [sim.publish(AUTHORS[0]), sim.publish(AUTHORS[2]), sim.publish(MUTED)];
    sim.edit(fresh[0].id);
    await headPoll(TIMELINE);
    await refresh(feed);
    await settled(feed);

    const second = await walkToEnd(feed, sim, TIMELINE);
    expectWalkInvariants(feed, sim, TIMELINE, second, 'walk after refresh');
    expect(feed.result.current.postIds.slice(0, 2)).toEqual([fresh[1].id, fresh[0].id]);
  });

  // Known defect, tracked as #2535: the head poll's lower bound is the head post's local
  // `indexed_at`. When another user edits the head post and this client's TTL refresh writes
  // the bumped value, the next poll asks Nexus for posts above the edit time and skips every
  // post published between the head's score and that edit. Expected to fail until #2535
  // lands; vitest then reports it as unexpectedly passing, and `.fails` comes off.
  it.fails(
    'head-polls every post published above the head after a remote edit bumped its indexed_at (#2535)',
    async () => {
      const sim = newSim();
      seedStream(sim, 20, () => AUTHORS[1]);
      wireNexus(sim);
      const feed = mountFeed(TIMELINE);
      await settled(feed);
      const head = sim.stream()[0];

      const publishedBeforeEdit = sim.publish(AUTHORS[2]);
      sim.edit(head.id);
      await ttlRefresh(sim, [head.id]);
      const publishedAfterEdit = sim.publish(AUTHORS[0]);
      await headPoll(TIMELINE);
      await refresh(feed);
      await settled(feed);

      expect(feed.result.current.postIds.slice(0, 3)).toEqual([publishedAfterEdit.id, publishedBeforeEdit.id, head.id]);
    },
  );

  describe('randomized remote-origin runs', () => {
    const seeds = Array.from({ length: Number(process.env.SIM_SEEDS ?? 16) }, (_, i) => i + 1);

    it.each(seeds)('seed %i', async (seed) => {
      const random = prng(seed);
      const pickAuthor = () => (random() < 0.15 ? MUTED : AUTHORS[Math.floor(random() * AUTHORS.length)]);
      const streamId = random() < 0.35 ? PROFILE : TIMELINE;
      const author = authorOf(streamId);
      const sim = newSim();
      seedStream(sim, 30 + Math.floor(random() * 70), streamId === PROFILE ? () => AUTHORS[0] : pickAuthor);
      wireNexus(sim);
      const warm = random() < 0.5;
      if (warm) await warmCache(sim, streamId);
      const feed = mountFeed(streamId);
      await settled(feed);

      const notYetDelivered = () => {
        const delivered = new Set(feed.result.current.postIds);
        return sim.stream(author).filter((post) => !delivered.has(post.id) && !sim.deletedEver.has(post.id));
      };
      const pickPost = (): SimPost | undefined => {
        const candidates = random() < 0.7 ? notYetDelivered() : sim.stream(author);
        return candidates[Math.floor(random() * candidates.length)];
      };

      const applyEvents = async (round: number) => {
        let seamCost = 0;
        let headPolls = 0;
        const eventCount = random() < 0.4 ? 0 : 1 + Math.floor(random() * 3);
        for (let i = 0; i < eventCount; i += 1) {
          const roll = random();
          if (roll < 0.25) {
            const post = pickPost();
            if (post) sim.edit(post.id);
          } else if (roll < 0.4) {
            const post = pickPost();
            if (post) sim.tombstone(post.id);
          } else if (roll < 0.47) {
            const post = pickPost();
            if (post) sim.purge(post.id);
          } else if (roll < 0.6) {
            sim.publish(streamId === PROFILE ? AUTHORS[0] : pickAuthor());
          } else if (roll < 0.78) {
            const ids = sim.stream(author).map((post) => post.id);
            const sample = ids.filter(() => random() < 0.3).slice(0, 25);
            await ttlRefresh(sim, sample);
          } else if (roll < 0.86 && streamId === TIMELINE) {
            await bootstrap(sim);
            seamCost += round + 2;
          } else if (roll < 0.93) {
            await headPoll(streamId);
            headPolls += 1;
          } else {
            // `otherTabClearsRow` stays out of the random mix: a walk whose row vanished is a
            // known gap (#2570), reproduced by the expected-failure scenario above.
            await otherTabPaginates(sim, streamId);
            seamCost += 2;
          }
        }
        return { seamCost, headPolls };
      };

      const walk = await walkToEnd(feed, sim, streamId, { beforeRound: applyEvents }, warm ? 2 : 0);
      expectWalkInvariants(feed, sim, streamId, walk, `seed ${seed} (${streamId}) first walk`);

      // A refresh merges whatever the head polls collected and starts a second walk.
      await refresh(feed);
      await settled(feed);
      const second = await walkToEnd(feed, sim, streamId, { beforeRound: applyEvents });
      expectWalkInvariants(feed, sim, streamId, second, `seed ${seed} (${streamId}) walk after refresh`);
    });
  });
});
