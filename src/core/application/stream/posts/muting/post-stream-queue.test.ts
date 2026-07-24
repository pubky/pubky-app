import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Pubky } from '@/models/models.types';
import { PostDetailsModel } from '@/models/post/details/postDetails';
import type { PostStreamId } from '@/models/stream/post/postStream.types';
import { PostStreamQueue } from './post-stream-queue';
import type { CollectParams } from './post-stream-queue.types';

describe('PostStreamQueue', () => {
  let queue: PostStreamQueue;
  const streamId = 'timeline:all:all' as PostStreamId;
  const BASE_TIMESTAMP = 1000000;

  beforeEach(() => {
    queue = new PostStreamQueue();
  });

  afterEach(() => {
    queue.clear();
    vi.restoreAllMocks();
  });

  // ============================================================================
  // Basic Queue Operations
  // ============================================================================

  describe('Basic operations', () => {
    it('should save and retrieve queue entries', () => {
      queue['save'](streamId, ['post1', 'post2'], BASE_TIMESTAMP);
      const entry = queue.get(streamId);

      expect(entry).toBeDefined();
      expect(entry?.posts).toEqual(['post1', 'post2']);
      expect(entry?.cursor).toBe(BASE_TIMESTAMP);
    });

    it('should remove specific stream entries', () => {
      queue['save'](streamId, ['post1'], BASE_TIMESTAMP);
      queue.remove(streamId);

      expect(queue.get(streamId)).toBeUndefined();
    });

    it('should clear all entries', () => {
      queue['save'](streamId, ['post1'], BASE_TIMESTAMP);
      queue['save']('timeline:following:all' as PostStreamId, ['post2'], BASE_TIMESTAMP);

      queue.clear();

      expect(queue.get(streamId)).toBeUndefined();
      expect(queue.get('timeline:following:all' as PostStreamId)).toBeUndefined();
    });

    it('should delete empty queues instead of saving them', () => {
      // First save some posts
      queue['save'](streamId, ['post1', 'post2', 'post3'], BASE_TIMESTAMP);
      expect(queue.get(streamId)).toBeDefined();

      // Finalize with empty toSave should delete the entry
      queue['finalize'](streamId, ['post1', 'post2'], 2, BASE_TIMESTAMP, [], undefined, false);
      expect(queue.get(streamId)).toBeUndefined();
    });
  });

  // ============================================================================
  // No Duplicates Tests - The Critical Cases
  // ============================================================================

  describe('No duplicates guarantee', () => {
    it('should never return duplicate posts across multiple pagination calls', async () => {
      // Setup: Mock PostDetailsModel to return timestamps
      const mockPostDetails = (postId: string, timestamp: number) => ({
        id: postId,
        indexed_at: timestamp,
        content: `Post ${postId}`,
        kind: 'short' as const,
        uri: `pubky://author/${postId}`,
        author: 'author1' as Pubky,
        attachments: null,
      });

      vi.spyOn(PostDetailsModel, 'findById').mockImplementation(async (id) => {
        const idStr = id as string;
        const index = parseInt(idStr.split('-')[1]);
        return mockPostDetails(idStr, BASE_TIMESTAMP + index);
      });

      // Scenario: Fetch posts in multiple pagination calls, tracking all returned IDs
      const allReturnedPosts = new Set<string>();
      let currentCursor = BASE_TIMESTAMP;

      // Mock fetch that returns different posts each time
      let fetchCallCount = 0;
      const mockFetch = vi.fn(async (_cursor: number) => {
        fetchCallCount++;
        const batch = fetchCallCount;
        const posts = Array.from({ length: 30 }, (_, i) => `post-${batch * 30 + i}`);
        return {
          nextPageIds: posts,
          cacheMissPostIds: [],
          nextCursor: BASE_TIMESTAMP + batch * 30,
        };
      });

      const params: CollectParams = {
        limit: 20,
        cursor: currentCursor,
        filter: (posts) => posts, // No filtering
        fetch: mockFetch,
      };

      // Call 1: Get first 20 posts (should save 10 to queue)
      const result1 = await queue.collect(streamId, params);
      expect(result1.posts).toHaveLength(20);
      result1.posts.forEach((id) => allReturnedPosts.add(id));

      // Call 2: Should use queue (10 posts) + fetch more (10 new posts)
      params.cursor = result1.nextCursor!;
      const result2 = await queue.collect(streamId, params);
      expect(result2.posts).toHaveLength(20);

      // Check for duplicates
      const duplicatesFound: string[] = [];
      result2.posts.forEach((id) => {
        if (allReturnedPosts.has(id)) {
          duplicatesFound.push(id);
        }
        allReturnedPosts.add(id);
      });

      expect(duplicatesFound).toHaveLength(0);
      expect(allReturnedPosts.size).toBe(40); // 20 + 20 unique posts
    });

    it('should not return duplicates when queue is re-filtered', async () => {
      // Setup
      vi.spyOn(PostDetailsModel, 'findById').mockImplementation(async (id) => {
        const idStr = id as string;
        const index = parseInt(idStr.split('-')[1]);
        return {
          id: idStr,
          indexed_at: BASE_TIMESTAMP + index,
          content: `Post ${idStr}`,
          kind: 'short' as const,
          uri: `pubky://author/${id}`,
          author: 'author1' as Pubky,
          attachments: null,
        };
      });

      // First call: Save posts to queue
      const mockFetch1 = vi.fn(async () => ({
        nextPageIds: Array.from({ length: 30 }, (_, i) => `author1:post-${i}`),
        cacheMissPostIds: [],
        nextCursor: BASE_TIMESTAMP + 30,
      }));

      const result1 = await queue.collect(streamId, {
        limit: 20,
        cursor: BASE_TIMESTAMP,
        filter: (posts) => posts,
        fetch: mockFetch1,
      });

      expect(result1.posts).toHaveLength(20);
      expect(queue.get(streamId)?.posts).toHaveLength(10); // 10 in queue

      // Second call: Filter out some posts from queue (simulating mute change)
      const filterMuted = (posts: string[]) => posts.filter((p) => !p.includes('post-5'));

      const mockFetch2 = vi.fn(async () => ({
        nextPageIds: Array.from({ length: 20 }, (_, i) => `author1:post-${30 + i}`),
        cacheMissPostIds: [],
        nextCursor: BASE_TIMESTAMP + 50,
      }));

      const result2 = await queue.collect(streamId, {
        limit: 20,
        cursor: result1.nextCursor!,
        filter: filterMuted,
        fetch: mockFetch2,
      });

      // Check no duplicates between result1 and result2
      const set1 = new Set(result1.posts);
      const duplicates = result2.posts.filter((id) => set1.has(id));

      expect(duplicates).toHaveLength(0);
    });

    it('should deduplicate posts within a single collect call', async () => {
      // Scenario: Fetch returns duplicates, queue should dedupe them
      let fetchCount = 0;
      const limit = 20;
      const mockFetch = vi.fn(async () => {
        fetchCount++;
        if (fetchCount === 1) {
          // First batch: mix of valid and muted posts (returns exactly limit to avoid end-of-stream)
          return {
            nextPageIds: [
              ...Array.from({ length: 15 }, (_, i) => `valid:post-${i}`),
              ...Array.from({ length: 5 }, (_, i) => `muted:post-${i}`),
            ],
            cacheMissPostIds: [],
            nextCursor: BASE_TIMESTAMP + 19,
          };
        } else {
          // Second batch: some duplicates from first batch + new posts
          return {
            nextPageIds: [
              'valid:post-10', // Duplicate
              'valid:post-11', // Duplicate
              ...Array.from({ length: 13 }, (_, i) => `valid:post-${i + 15}`), // New posts
              ...Array.from({ length: 5 }, (_, i) => `muted:post-${i + 5}`), // Muted
            ],
            cacheMissPostIds: [],
            nextCursor: BASE_TIMESTAMP + 39,
          };
        }
      });

      const result = await queue.collect(streamId, {
        limit,
        cursor: BASE_TIMESTAMP,
        filter: (posts) => posts.filter((p) => !p.startsWith('muted:')), // Filter muted
        fetch: mockFetch,
      });

      // First fetch gives 15 valid posts, need 5 more
      // Second fetch should dedupe posts 10-11 and add new ones
      expect(result.posts).toHaveLength(20);
      const uniqueIds = new Set(result.posts);
      expect(uniqueIds.size).toBe(20); // All unique
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  // ============================================================================
  // No Skipped Posts Tests
  // ============================================================================

  describe('No skipped posts guarantee', () => {
    it('should return correct timestamp to ensure continuous pagination', async () => {
      // This tests the bug fix: early return from queue should have correct timestamp
      const mockPostDetails = (index: number) => ({
        id: `post-${index}`,
        indexed_at: BASE_TIMESTAMP + index,
        content: `Post ${index}`,
        kind: 'short' as const,
        uri: `pubky://author/post-${index}`,
        author: 'author1' as Pubky,
        attachments: null,
      });

      vi.spyOn(PostDetailsModel, 'findById').mockImplementation(async (id) => {
        const idStr = id as string;
        const index = parseInt(idStr.split('-')[1]);
        return mockPostDetails(index);
      });

      // First call: Fetch 30 posts, return 20, save 10 to queue
      const mockFetch1 = vi.fn(async () => ({
        nextPageIds: Array.from({ length: 30 }, (_, i) => `post-${i}`),
        cacheMissPostIds: [],
        nextCursor: BASE_TIMESTAMP + 29, // Timestamp of last post in fetch result
      }));

      const result1 = await queue.collect(streamId, {
        limit: 20,
        cursor: BASE_TIMESTAMP,
        filter: (posts) => posts,
        fetch: mockFetch1,
      });

      expect(result1.posts).toHaveLength(20);
      expect(result1.posts[19]).toBe('post-19'); // Last post returned
      // When fetching, timestamp comes from the fetch result (last post fetched)
      expect(result1.nextCursor).toBe(BASE_TIMESTAMP + 29);

      // Second call: Use queue (10 posts), early return
      // Should NOT fetch from Nexus since queue has enough
      const mockFetch2 = vi.fn();

      const result2 = await queue.collect(streamId, {
        limit: 10,
        cursor: result1.nextCursor!,
        filter: (posts) => posts,
        fetch: mockFetch2,
      });

      expect(mockFetch2).not.toHaveBeenCalled(); // Early return path
      expect(result2.posts).toHaveLength(10);
      expect(result2.posts[0]).toBe('post-20'); // Should continue from post-20
      expect(result2.posts[9]).toBe('post-29');
      // When early returning from queue, timestamp is calculated from last returned post
      expect(result2.nextCursor).toBe(BASE_TIMESTAMP + 29); // Timestamp of post-29

      // Verify no gap: result1 ends at post-19, result2 starts at post-20
      const allPosts = [...result1.posts, ...result2.posts];
      expect(allPosts).toEqual(Array.from({ length: 30 }, (_, i) => `post-${i}`));
    });

    it('should maintain correct pagination cursor across queue refills', async () => {
      // Track all posts returned across multiple calls
      const allReturnedPosts: string[] = [];

      vi.spyOn(PostDetailsModel, 'findById').mockImplementation(async (id) => {
        const idStr = id as string;
        const index = parseInt(idStr.split('-')[1]);
        return {
          id: idStr,
          indexed_at: BASE_TIMESTAMP + index,
          content: `Post ${idStr}`,
          kind: 'short' as const,
          uri: `pubky://author/${id}`,
          author: 'author1' as Pubky,
          attachments: null,
        };
      });

      // Simulate multiple pagination calls
      let nextBatch = 0;
      const mockFetch = vi.fn(async () => {
        const start = nextBatch * 25;
        const posts = Array.from({ length: 25 }, (_, i) => `post-${start + i}`);
        nextBatch++;
        return {
          nextPageIds: posts,
          cacheMissPostIds: [],
          nextCursor: BASE_TIMESTAMP + start + 24,
        };
      });

      let cursor = BASE_TIMESTAMP;

      // Call 1
      const result1 = await queue.collect(streamId, {
        limit: 20,
        cursor,
        filter: (posts) => posts,
        fetch: mockFetch,
      });
      allReturnedPosts.push(...result1.posts);
      cursor = result1.nextCursor!;

      // Call 2
      const result2 = await queue.collect(streamId, {
        limit: 20,
        cursor,
        filter: (posts) => posts,
        fetch: mockFetch,
      });
      allReturnedPosts.push(...result2.posts);
      cursor = result2.nextCursor!;

      // Call 3
      const result3 = await queue.collect(streamId, {
        limit: 20,
        cursor,
        filter: (posts) => posts,
        fetch: mockFetch,
      });
      allReturnedPosts.push(...result3.posts);

      // Verify: Should have continuous sequence without gaps
      expect(allReturnedPosts).toEqual(Array.from({ length: 60 }, (_, i) => `post-${i}`));

      // Verify no duplicates
      const uniquePosts = new Set(allReturnedPosts);
      expect(uniquePosts.size).toBe(60);
    });
  });

  // ============================================================================
  // Edge Cases
  // ============================================================================

  describe('Edge cases', () => {
    it('should handle empty queue correctly', async () => {
      const mockFetch = vi.fn(async () => ({
        nextPageIds: ['post1', 'post2', 'post3'],
        cacheMissPostIds: [],
        nextCursor: BASE_TIMESTAMP + 3,
      }));

      const result = await queue.collect(streamId, {
        limit: 3,
        cursor: BASE_TIMESTAMP,
        filter: (posts) => posts,
        fetch: mockFetch,
      });

      expect(result.posts).toEqual(['post1', 'post2', 'post3']);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should handle queue with zero posts after filtering', async () => {
      // Pre-populate queue
      queue['save'](streamId, ['muted:post1', 'muted:post2'], BASE_TIMESTAMP);

      // Filter removes all queue posts
      const mockFetch = vi.fn(async () => ({
        nextPageIds: ['valid:post1', 'valid:post2', 'valid:post3'],
        cacheMissPostIds: [],
        nextCursor: BASE_TIMESTAMP + 10,
      }));

      const result = await queue.collect(streamId, {
        limit: 3,
        cursor: BASE_TIMESTAMP,
        filter: (posts) => posts.filter((p) => !p.startsWith('muted:')),
        fetch: mockFetch,
      });

      expect(result.posts).toEqual(['valid:post1', 'valid:post2', 'valid:post3']);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should handle max fetch iterations correctly', async () => {
      // Mock fetch that returns full batches but all get filtered out
      let callCount = 0;
      const mockFetch = vi.fn(async () => {
        callCount++;
        // Return exactly limit posts to avoid end-of-stream detection
        return {
          nextPageIds: Array.from({ length: 20 }, (_, i) => `muted:post-${callCount}-${i}`),
          cacheMissPostIds: [],
          nextCursor: BASE_TIMESTAMP + callCount * 20,
        };
      });

      const result = await queue.collect(streamId, {
        limit: 20,
        cursor: BASE_TIMESTAMP,
        filter: (posts) => posts.filter((p) => !p.startsWith('muted:')), // Filter out everything
        fetch: mockFetch,
      });

      // Should stop at MAX_FETCH_ITERATIONS (20)
      expect(mockFetch).toHaveBeenCalledTimes(20);
      expect(result.posts).toHaveLength(0);
    });

    it('should deduplicate cache miss IDs across multiple fetches', async () => {
      let fetchCount = 0;
      const limit = 20;
      const mockFetch = vi.fn(async () => {
        fetchCount++;
        const start = (fetchCount - 1) * 10;
        // Return exactly limit posts (mix of valid and muted) to avoid end-of-stream detection
        return {
          nextPageIds: [
            ...Array.from({ length: 10 }, (_, i) => `valid:post-${start + i}`),
            ...Array.from({ length: 10 }, (_, i) => `muted:post-${start + i}`),
          ],
          cacheMissPostIds: ['cache-miss-1', 'cache-miss-2', `cache-miss-batch-${fetchCount}`],
          nextCursor: BASE_TIMESTAMP + start + 19,
        };
      });

      const result = await queue.collect(streamId, {
        limit, // 20 posts requested
        cursor: BASE_TIMESTAMP,
        filter: (posts) => posts.filter((p) => !p.startsWith('muted:')), // Filter out muted (50% of posts)
        fetch: mockFetch,
      });

      // Each fetch returns 20 posts, but only 10 are valid after filtering
      // Need 2 fetches to get 20 valid posts
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result.posts).toHaveLength(20);
      // Cache miss IDs should be deduplicated
      // Fetch 1: ['cache-miss-1', 'cache-miss-2', 'cache-miss-batch-1']
      // Fetch 2: ['cache-miss-1', 'cache-miss-2', 'cache-miss-batch-2']
      // After dedup: ['cache-miss-1', 'cache-miss-2', 'cache-miss-batch-1', 'cache-miss-batch-2']
      expect(result.cacheMissIds).toContain('cache-miss-1');
      expect(result.cacheMissIds).toContain('cache-miss-2');
      expect(result.cacheMissIds).toContain('cache-miss-batch-1');
      expect(result.cacheMissIds).toContain('cache-miss-batch-2');
      expect(result.cacheMissIds).toHaveLength(4); // Deduplicated
    });

    it('should return undefined timestamp when queue is empty and no posts found', async () => {
      vi.spyOn(PostDetailsModel, 'findById').mockResolvedValue(null);

      queue['save'](streamId, [], BASE_TIMESTAMP);

      const result = await queue['getLastPostCursor']([], 10);
      expect(result).toBeUndefined();
    });
  });

  // ============================================================================
  // Timestamp Calculation Tests
  // ============================================================================

  describe('getLastPostCursor', () => {
    it('should return timestamp of the last post being returned', async () => {
      const mockPost = {
        id: 'post-5',
        indexed_at: BASE_TIMESTAMP + 5,
        content: 'Test post',
        kind: 'short' as const,
        uri: 'pubky://author/post-5',
        author: 'author1' as Pubky,
        attachments: null,
      };

      vi.spyOn(PostDetailsModel, 'findById').mockResolvedValue(mockPost);

      const posts = ['post-1', 'post-2', 'post-3', 'post-4', 'post-5', 'post-6'];
      const timestamp = await queue['getLastPostCursor'](posts, 5);

      expect(timestamp).toBe(BASE_TIMESTAMP + 5);
      expect(PostDetailsModel.findById).toHaveBeenCalledWith('post-5');
    });

    it('should return undefined when post details not found', async () => {
      vi.spyOn(PostDetailsModel, 'findById').mockResolvedValue(null);

      const posts = ['post-1', 'post-2'];
      const timestamp = await queue['getLastPostCursor'](posts, 2);

      expect(timestamp).toBeUndefined();
    });

    it('should return undefined for empty posts array', async () => {
      const timestamp = await queue['getLastPostCursor']([], 10);
      expect(timestamp).toBeUndefined();
    });
  });

  // ============================================================================
  // Skip-paginated streams (engagement + single-collection) - filter resilience
  // ============================================================================

  describe('Skip-paginated streams advance by raw count, not visible count', () => {
    // total_engagement:all:collection is the Discover Collections stream; the Hot feed is
    // total_engagement:all:all. Both page by `skip` and get last_post_score: null from Nexus.
    const skipStreamId = 'total_engagement:all:collection' as PostStreamId;

    it('advances the skip offset past a fully-filtered page instead of re-requesting it', async () => {
      // Page at offset 0: 20 raw ids ALL filtered out (muted / own / bookmarked).
      // Page at offset 20: 20 valid ids.
      const seenCursors: number[] = [];
      const mockFetch = vi.fn(async (cursor: number) => {
        seenCursors.push(cursor);
        const allFiltered = cursor === 0;
        return {
          nextPageIds: Array.from({ length: 20 }, (_, i) =>
            allFiltered ? `muted:post-${i}` : `valid:post-${cursor + i}`,
          ),
          cacheMissPostIds: [],
          nextCursor: undefined, // skip streams carry no score cursor (Nexus sends null)
        };
      });

      const result = await queue.collect(skipStreamId, {
        limit: 20,
        cursor: 0,
        filter: (posts) => posts.filter((p) => !p.startsWith('muted:')),
        fetch: mockFetch,
      });

      // The fully-filtered first page still advanced the offset 0 -> 20, so the second
      // fetch requested offset 20 (the NEXT page), not 0 again. This is the whole fix.
      expect(seenCursors).toEqual([0, 20]);
      expect(result.posts).toHaveLength(20);
      expect(result.posts.every((id) => id.startsWith('valid:'))).toBe(true);
      // Resume cursor is the raw offset consumed (two 20-id pages).
      expect(result.nextCursor).toBe(40);
      expect(result.reachedEnd).toBe(false);
    });

    it('keeps advancing across successive collect calls (no stall under constant filtering)', async () => {
      // Every page is 50% filtered; the offset must move by the full raw page each time.
      const mockFetch = vi.fn(async (cursor: number) => ({
        nextPageIds: [
          ...Array.from({ length: 10 }, (_, i) => `muted:post-${cursor + i}`),
          ...Array.from({ length: 10 }, (_, i) => `valid:post-${cursor + 10 + i}`),
        ],
        cacheMissPostIds: [],
        nextCursor: undefined,
      }));

      const first = await queue.collect(skipStreamId, {
        limit: 20,
        cursor: 0,
        filter: (posts) => posts.filter((p) => !p.startsWith('muted:')),
        fetch: mockFetch,
      });
      expect(first.nextCursor).toBe(40); // 20 valid needed two raw pages: 0 -> 20 -> 40

      const second = await queue.collect(skipStreamId, {
        limit: 20,
        cursor: first.nextCursor!,
        filter: (posts) => posts.filter((p) => !p.startsWith('muted:')),
        fetch: mockFetch,
      });
      expect(second.nextCursor).toBe(80);

      // No overlap between the two collects.
      const firstSet = new Set(first.posts);
      expect(second.posts.some((id) => firstSet.has(id))).toBe(false);
    });
  });

  // ============================================================================
  // Score streams (timeline) - filter-resilient backfill
  // ============================================================================

  describe('Score streams backfill past bursts of filtered posts', () => {
    it('walks a score stream past an All-feed collection flood instead of returning empty', async () => {
      // First two pages are all collections (filtered out); the third has real posts.
      const timelineId = 'timeline:all:all' as PostStreamId;
      const mockFetch = vi.fn(async (cursor: number) => {
        const isFlood = cursor > BASE_TIMESTAMP - 20;
        return {
          nextPageIds: Array.from({ length: 10 }, (_, i) =>
            isFlood ? `collection:c-${cursor}-${i}` : `user:post-${cursor}-${i}`,
          ),
          cacheMissPostIds: [],
          nextCursor: cursor - 10, // descending score cursor
        };
      });

      const result = await queue.collect(timelineId, {
        limit: 10,
        cursor: BASE_TIMESTAMP,
        filter: (posts) => posts.filter((p) => !p.startsWith('collection:')),
        fetch: mockFetch,
      });

      expect(result.posts).toHaveLength(10);
      expect(result.posts.every((id) => id.startsWith('user:'))).toBe(true);
      // Walked three raw pages to fill the page (two flooded + one real), advancing by score.
      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(result.nextCursor).toBe(BASE_TIMESTAMP - 30);
    });
  });

  // ============================================================================
  // Overflow early-return cursor resolution (cursorForPost)
  // ============================================================================

  describe('Overflow early-return resolves score cursors via cursorForPost', () => {
    // Seed an overflow buffer: one collect whose fetch over-delivers relative to its limit.
    const seedOverflow = async (id: PostStreamId, nextCursor: number | undefined) => {
      const mockFetch = vi.fn(async () => ({
        nextPageIds: Array.from({ length: 20 }, (_, i) => `author:post-${i}`),
        cacheMissPostIds: [],
        nextCursor,
      }));
      return queue.collect(id, {
        limit: 5,
        cursor: nextCursor === undefined ? 0 : BASE_TIMESTAMP,
        filter: (p) => p,
        fetch: mockFetch,
      });
    };

    it('uses the stream-aware resolver, not post indexed_at, when serving from the buffer', async () => {
      // Bookmark streams paginate by bookmark time (#2100); the buffered path must ask the
      // caller for the cursor instead of reading the post's own indexed_at.
      const first = await seedOverflow(streamId, BASE_TIMESTAMP + 20);
      expect(first.posts).toHaveLength(5);
      expect(queue.get(streamId)?.posts).toHaveLength(15);

      const cursorForPost = vi.fn(async () => BASE_TIMESTAMP + 9999);
      const noFetch = vi.fn();
      const second = await queue.collect(streamId, {
        limit: 10,
        cursor: first.nextCursor!,
        filter: (p) => p,
        fetch: noFetch,
        cursorForPost,
      });

      expect(noFetch).not.toHaveBeenCalled();
      expect(second.posts).toEqual(Array.from({ length: 10 }, (_, i) => `author:post-${i + 5}`));
      // Resolved for the LAST post being returned, and its value is the resume cursor.
      expect(cursorForPost).toHaveBeenCalledWith('author:post-14');
      expect(second.nextCursor).toBe(BASE_TIMESTAMP + 9999);
    });

    it('skip streams keep resuming by the saved raw offset, ignoring cursorForPost', async () => {
      const skipId = 'total_engagement:all:all' as PostStreamId;
      const first = await seedOverflow(skipId, undefined);
      expect(first.nextCursor).toBe(20); // raw ids consumed

      const cursorForPost = vi.fn(async () => BASE_TIMESTAMP + 9999);
      const second = await queue.collect(skipId, {
        limit: 10,
        cursor: first.nextCursor!,
        filter: (p) => p,
        fetch: vi.fn(),
        cursorForPost,
      });

      expect(cursorForPost).not.toHaveBeenCalled();
      expect(second.nextCursor).toBe(20); // still the saved raw offset
    });
  });

  // ============================================================================
  // End-of-stream with buffered overflow (stranded-post regression)
  // ============================================================================

  describe('reachedEnd with buffered overflow', () => {
    it('holds reachedEnd until the overflow buffer is drained, so the final posts are not stranded', async () => {
      // Nexus's LAST page can overflow past `limit`: 4 survivors banked, then a final
      // 2-post page lands -> 6 accumulated, 5 returned, 1 buffered. Reporting
      // reachedEnd:true here would make consumers hide "Show more" / stop the
      // sentinel with a post still queued — stranded until a full reload.
      let call = 0;
      const mockFetch = vi.fn(async () => {
        call++;
        if (call === 1) {
          return {
            nextPageIds: ['muted:x', 'a:1', 'a:2', 'a:3', 'a:4'],
            cacheMissPostIds: [],
            nextCursor: BASE_TIMESTAMP + 5,
            reachedEnd: false,
          };
        }
        if (call === 2) {
          return {
            nextPageIds: ['a:5', 'a:6'], // final short page
            cacheMissPostIds: [],
            nextCursor: BASE_TIMESTAMP + 7,
            reachedEnd: true,
          };
        }
        return { nextPageIds: [], cacheMissPostIds: [], nextCursor: undefined, reachedEnd: true };
      });
      const filter = (posts: string[]) => posts.filter((p) => !p.startsWith('muted:'));

      const first = await queue.collect(streamId, { limit: 5, cursor: 0, filter, fetch: mockFetch });

      expect(first.posts).toEqual(['a:1', 'a:2', 'a:3', 'a:4', 'a:5']);
      expect(queue.get(streamId)?.posts).toEqual(['a:6']);
      // The fix: Nexus ended, but a post is still buffered -> NOT exhausted yet.
      expect(first.reachedEnd).toBe(false);

      // Follow-up load drains the buffer, re-fetches once at the end cursor (empty
      // page), and only then reports the stream exhausted.
      const second = await queue.collect(streamId, { limit: 5, cursor: BASE_TIMESTAMP + 7, filter, fetch: mockFetch });

      expect(second.posts).toEqual(['a:6']);
      expect(second.reachedEnd).toBe(true);
      expect(queue.get(streamId)).toBeUndefined();
    });
  });

  // ============================================================================
  // Per-call fetch cap (maxIterations)
  // ============================================================================

  describe('maxIterations override', () => {
    it('caps backend fetches per collect at the caller-provided bound', async () => {
      // Every page fully filtered and never reaching the end — the worst case for
      // a slow/metered connection. The caller's bound must stop the scan early.
      const mockFetch = vi.fn(async (cursor: number) => ({
        nextPageIds: Array.from({ length: 10 }, (_, i) => `muted:post-${cursor + i}`),
        cacheMissPostIds: [],
        nextCursor: undefined,
      }));

      const result = await queue.collect('total_engagement:all:collection' as PostStreamId, {
        limit: 10,
        cursor: 0,
        filter: (posts) => posts.filter((p) => !p.startsWith('muted:')),
        fetch: mockFetch,
        maxIterations: 3,
      });

      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(result.posts).toHaveLength(0);
      // The scan still advanced by the raw pages it consumed (3 × 10), and the
      // stream is not marked ended — the next user action resumes from offset 30.
      expect(result.nextCursor).toBe(30);
      expect(result.reachedEnd).toBe(false);
    });
  });
});
