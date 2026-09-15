import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { postStreamQueue } from '@/application/stream/posts/muting/post-stream-queue';
import { PostStreamApplication } from '@/application/stream/posts/post';
import { NOT_FOUND_CACHED_STREAM } from '@/controllers/stream/posts/post.constants';
import type { Pubky } from '@/models/models.types';
import { PostDetailsModel } from '@/models/post/details/postDetails';
import { DELETED } from '@/models/post/details/postDetails.constants';
import { buildSortedAuthorStreamId, type PostStreamId, PostStreamTypes } from '@/models/stream/post/postStream.types';
import { PostStreamModel } from '@/models/stream/post/tables/postStream';
import { UnreadPostStreamModel } from '@/models/stream/post/tables/postStream.unread';
import { UserStreamModel } from '@/models/stream/user/userStream';
import { LocalStreamPostsService } from '@/services/local/stream/posts/posts';
import { StreamSorting } from '@/services/nexus/nexus.types';
import { NexusPostStreamService } from '@/services/nexus/stream/posts/postStream';

/**
 * Score-cursor pagination against Nexus's real ordering (#2523, #1569).
 *
 * Nexus keeps a post at its original position in a timeline stream (its sorted-set score)
 * but bumps `details.indexed_at` when the post is edited or deleted. `last_post_score` is
 * the score, not `indexed_at`. Every cache→Nexus seam must therefore resume from a cursor
 * that came from Nexus, never from a post's local `indexed_at`, and the local cache must
 * keep pages in stream order so the raw resume anchor always sits at the tail.
 */

const VIEWER = 'user-viewer' as Pubky;
const AUTHOR = 'author-a';
const LIMIT = 10;

/** One post as Nexus orders it: `score` is its stream position, `indexedAt` its details row. */
type StreamPost = { id: string; score: number; indexedAt: number; content?: string };

/** `count` unedited posts (indexed_at === score) starting at `topScore`, descending by one. */
const unedited = (prefix: string, count: number, topScore: number, author = AUTHOR): StreamPost[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `${author}:${prefix}-${i + 1}`,
    score: topScore - i,
    indexedAt: topScore - i,
  }));

/** `count` posts kept at their original score but re-indexed at `indexedAtBase + i` (edit / delete). */
const reindexed = (
  prefix: string,
  count: number,
  topScore: number,
  indexedAtBase: number,
  content?: string,
  author = AUTHOR,
): StreamPost[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `${author}:${prefix}-${i + 1}`,
    score: topScore - i,
    indexedAt: indexedAtBase + i,
    content,
  }));

const ids = (posts: StreamPost[]) => posts.map((post) => post.id);

const persistDetails = async (posts: StreamPost[]) => {
  await Promise.all(
    posts.map((post) =>
      PostDetailsModel.create({
        id: post.id,
        content: post.content ?? `Content for ${post.id}`,
        kind: 'short',
        indexed_at: post.indexedAt,
        uri: `pubky://${AUTHOR}/pub/pubky.app/posts/${post.id}`,
        attachments: null,
      }),
    ),
  );
};

/**
 * Emulates a Nexus timeline stream: `start` is an inclusive upper bound on the score,
 * pages are `limit` long and `last_post_score` is the score of the last returned post.
 */
const mockNexusTimeline = (posts: StreamPost[]) =>
  vi.spyOn(NexusPostStreamService, 'fetch').mockImplementation(async ({ params }) => {
    const start = params.start;
    const page = posts.filter((post) => start === undefined || post.score <= start).slice(0, params.limit);
    return {
      post_keys: ids(page),
      last_post_score: page.length > 0 ? page[page.length - 1].score : null,
    };
  });

type Anchor = { lastPostId?: string; streamTail: number };

/** One `useStreamPagination` round: resume from the previous round's raw anchor and cursor. */
const runRound = async (streamId: PostStreamId, anchor: Anchor) =>
  await PostStreamApplication.getOrFetchStreamSlice({
    streamId,
    limit: LIMIT,
    streamHead: 0,
    streamTail: anchor.streamTail,
    lastPostId: anchor.lastPostId,
    viewerId: VIEWER,
  });

const nextAnchor = (result: Awaited<ReturnType<typeof runRound>>, prev: Anchor): Anchor => ({
  lastPostId: result.lastRawPostId ?? result.nextPageIds[result.nextPageIds.length - 1] ?? prev.lastPostId,
  streamTail: result.nextCursor ?? prev.streamTail,
});

/** Drives rounds like the hook until the stream ends or `maxRounds` is spent. */
const paginateToEnd = async (streamId: PostStreamId, maxRounds: number) => {
  const delivered: string[][] = [];
  let anchor: Anchor = {
    lastPostId: undefined,
    streamTail: await PostStreamApplication.getCachedLastPostTimestamp({ streamId }),
  };
  let reachedEnd = false;
  for (let round = 0; round < maxRounds && !reachedEnd; round++) {
    const result = await runRound(streamId, anchor);
    delivered.push(result.nextPageIds);
    anchor = nextAnchor(result, anchor);
    reachedEnd = result.reachedEnd === true;
  }
  return { delivered, reachedEnd, rounds: delivered.length };
};

describe('PostStreamApplication: score cursors come from Nexus, not from local indexed_at', () => {
  const streamId = PostStreamTypes.TIMELINE_ALL_ALL as PostStreamId;

  beforeEach(async () => {
    vi.restoreAllMocks();
    await PostStreamModel.table.clear();
    await UnreadPostStreamModel.table.clear();
    await PostDetailsModel.table.clear();
    await UserStreamModel.table.clear();
    postStreamQueue.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('pages past a run of edited posts below the cached tail without re-serving or looping (#2523 geometry)', async () => {
    // Stream order: 10 cached posts, then 10 posts edited AFTER everything else was indexed
    // (their indexed_at is newer than every cached post), then 10 unedited posts, then the end.
    const cached = unedited('cached', 10, 2000);
    const edited = reindexed('edited', 10, 1990, 3000);
    const older = unedited('older', 10, 1980);
    await persistDetails([...cached, ...edited, ...older]);
    // A warm cache from a previous session: only the first page, no persisted cursor yet.
    await PostStreamModel.create(streamId, ids(cached));
    const nexusSpy = mockNexusTimeline([...cached, ...edited, ...older]);

    const { delivered, reachedEnd } = await paginateToEnd(streamId, 6);

    expect(reachedEnd).toBe(true);
    const flat = delivered.flat();
    expect(new Set(flat).size).toBe(flat.length); // no round re-serves a post
    expect(flat).toEqual(ids([...cached, ...edited, ...older]));
    // One request per stream page below the cache plus the empty end page.
    expect(nexusSpy).toHaveBeenCalledTimes(3);
  });

  it('keeps Nexus pages in stream order in the cache and records the Nexus cursor on the row', async () => {
    const cached = unedited('cached', 10, 2000);
    const edited = reindexed('edited', 10, 1990, 3000);
    await persistDetails([...cached, ...edited]);
    await PostStreamModel.create(streamId, ids(cached));
    mockNexusTimeline([...cached, ...edited]);

    const seed = await PostStreamApplication.getCachedLastPostTimestamp({ streamId });
    const round1 = await runRound(streamId, { lastPostId: undefined, streamTail: seed });
    const round2 = await runRound(streamId, nextAnchor(round1, { streamTail: seed }));

    expect(round2.nextPageIds).toEqual(ids(edited));
    const row = await LocalStreamPostsService.read({ streamId });
    // Edited posts are NOT floated above the cached page by their newer indexed_at.
    expect(row?.stream).toEqual(ids([...cached, ...edited]));
    // The resume cursor is Nexus's last_post_score for the deepest page, not any indexed_at.
    expect(row?.tailCursor).toBe(edited[edited.length - 1].score);
    expect(round2.nextCursor).toBe(edited[edited.length - 1].score);
    expect(round2.lastRawPostId).toBe(edited[edited.length - 1].id);
  });

  it('seeds a resumed session from the persisted Nexus cursor instead of the tail post indexed_at', async () => {
    const cached = unedited('cached', 10, 2000);
    // The local tail is an edited post: its indexed_at (3000) would point Nexus far above its score.
    const editedTail = reindexed('edited', 1, 1990, 3000);
    await persistDetails([...cached, ...editedTail]);
    await LocalStreamPostsService.persistNewStreamChunk({
      streamId,
      stream: ids([...cached, ...editedTail]),
      tailCursor: 1990,
    });

    await expect(PostStreamApplication.getCachedLastPostTimestamp({ streamId })).resolves.toBe(1990);
  });

  it('still seeds legacy rows (no persisted cursor) from the last resolvable post timestamp', async () => {
    const cached = unedited('cached', 5, 2000);
    await persistDetails(cached);
    await PostStreamModel.create(streamId, ids(cached));

    await expect(PostStreamApplication.getCachedLastPostTimestamp({ streamId })).resolves.toBe(1996);
    await PostStreamModel.table.clear();
    await expect(PostStreamApplication.getCachedLastPostTimestamp({ streamId })).resolves.toBe(NOT_FOUND_CACHED_STREAM);
  });

  it('converges within a bounded number of rounds when a legacy row ends on an edited post', async () => {
    // Legacy row (no cursor) whose tail is an edited post: the one-time indexed_at seed
    // points above the cache, so the first Nexus page repeats cached posts. The Nexus
    // cursor persisted by that page must take over, so the walk cannot loop.
    const cached = unedited('cached', 10, 2000);
    const editedTail = reindexed('edited', 1, 1990, 3000);
    const older = unedited('older', 10, 1980);
    await persistDetails([...cached, ...editedTail, ...older]);
    await PostStreamModel.create(streamId, ids([...cached, ...editedTail]));
    mockNexusTimeline([...cached, ...editedTail, ...older]);

    const { delivered, reachedEnd, rounds } = await paginateToEnd(streamId, 8);

    expect(reachedEnd).toBe(true);
    expect(rounds).toBeLessThanOrEqual(6);
    expect(delivered.flat()).toEqual(expect.arrayContaining(ids(older)));
  });

  it('resumes below the deepest rendered id when the raw anchor was removed from the row', async () => {
    const cached = unedited('cached', 10, 2000);
    const deeper = unedited('deeper', 10, 1990);
    await persistDetails([...cached, ...deeper]);
    await LocalStreamPostsService.persistNewStreamChunk({
      streamId,
      stream: ids([...cached, ...deeper]),
      tailCursor: deeper[deeper.length - 1].score,
    });
    const nexusSpy = mockNexusTimeline([...cached, ...deeper]);

    // The reader has rendered the first page; its raw anchor (cached-10) is then deleted.
    const anchor = cached[cached.length - 1];
    await LocalStreamPostsService.removeFromStream({ streamId, compositePostId: anchor.id });

    const result = await PostStreamApplication.getOrFetchStreamSlice({
      streamId,
      limit: LIMIT,
      streamHead: 0,
      streamTail: deeper[deeper.length - 1].score,
      lastPostId: anchor.id,
      visiblePostIds: ids(cached),
      viewerId: VIEWER,
    });

    // The next page, not the row tail (which would skip every cached id in between).
    expect(result.nextPageIds).toEqual(ids(deeper));
    expect(nexusSpy).not.toHaveBeenCalled();
  });

  it('resumes from the row tail after a Nexus page that only repeated cached posts (legacy row)', async () => {
    // Legacy row whose tail is an edited post: the one-time indexed_at seed sends the first
    // Nexus request far above the cache, so the page repeats cached ids and adds nothing.
    // The anchor must still land on the row tail, not on the last id of that page, or the
    // next round re-walks the cache from the middle and re-serves the tail.
    const cached = unedited('cached', 10, 2000);
    const editedTail = reindexed('edited', 1, 1990, 3000);
    const older = unedited('older', 10, 1980);
    await persistDetails([...cached, ...editedTail, ...older]);
    await PostStreamModel.create(streamId, ids([...cached, ...editedTail]));
    const nexusSpy = mockNexusTimeline([...cached, ...editedTail, ...older]);

    const seed = await PostStreamApplication.getCachedLastPostTimestamp({ streamId });
    expect(seed).toBe(3000);
    const round1 = await runRound(streamId, { lastPostId: undefined, streamTail: seed });
    const round2 = await runRound(streamId, nextAnchor(round1, { streamTail: seed }));

    expect(round2.lastRawPostId).toBe(editedTail[0].id);
    expect(round2.nextCursor).toBe(1992); // Nexus's cursor for the repeated page took over
    const round3 = await runRound(streamId, nextAnchor(round2, nextAnchor(round1, { streamTail: seed })));
    expect(round3.nextPageIds).toEqual(expect.arrayContaining(ids(older.slice(0, 8))));
    expect(nexusSpy).toHaveBeenCalledTimes(2);
  });

  it('pages a profile past a run of re-indexed deleted tombstones (#1569 geometry)', async () => {
    // Deleting bumps indexed_at too, so a run of tombstones sorts above live posts locally
    // while Nexus keeps them at their original position. The author stream filters them out.
    const authorStreamId: PostStreamId = buildSortedAuthorStreamId(StreamSorting.TIMELINE, AUTHOR as Pubky, 'all');
    const live = unedited('live', 10, 2000);
    const deleted = reindexed('gone', 25, 1990, 3000, DELETED);
    const older = unedited('older', 10, 1965);
    await persistDetails([...live, ...deleted, ...older]);
    await LocalStreamPostsService.upsert({ streamId: authorStreamId, stream: ids(live) });
    mockNexusTimeline([...live, ...deleted, ...older]);

    const { delivered, reachedEnd } = await paginateToEnd(authorStreamId, 8);

    expect(reachedEnd).toBe(true);
    const flat = delivered.flat();
    expect(new Set(flat).size).toBe(flat.length);
    expect(flat).toEqual(ids([...live, ...older]));
  });
});
