import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PostStreamApplication } from '@/application/stream/posts/post';
import type { Pubky } from '@/models/models.types';
import { PostDetailsModel } from '@/models/post/details/postDetails';
import { DELETED } from '@/models/post/details/postDetails.constants';
import { type PostStreamId, PostStreamTypes } from '@/models/stream/post/postStream.types';
import { PostStreamModel } from '@/models/stream/post/tables/postStream';
import { UnreadPostStreamModel } from '@/models/stream/post/tables/postStream.unread';
import { UserStreamModel } from '@/models/stream/user/userStream';
import { type UserStreamId, UserStreamTypes } from '@/models/stream/user/userStream.types';
import { UserCountsModel } from '@/models/user/counts/userCounts';
import { UserDetailsModel } from '@/models/user/details/userDetails';
import { UserRelationshipsModel } from '@/models/user/relationships/userRelationships';
import { UserTagsModel } from '@/models/user/tags/userTags';
import { LocalMuteService } from '@/services/local/mute/mute';
import { LocalStreamPostsService } from '@/services/local/stream/posts/posts';
import type { NexusPostsKeyStream } from '@/services/nexus/nexus.types';
import { NexusPostStreamService } from '@/services/nexus/stream/posts/postStream';
import { PostStreamQueue, postStreamQueue } from './post-stream-queue';

/**
 * Tests for mute filtering with stream pagination
 *
 * Verifies that muting works correctly in combination with pagination and the queue.
 * Covers all scenarios from the bug report:
 *
 * 1. Mute a user who posts frequently
 * 2. Scroll through the home feed timeline (pagination continues correctly)
 * 3. Verify pagination continues correctly until true end of stream
 * 4. Unmute and verify behavior remains correct
 * 5. Test with cache cleared and with existing cache
 * 6. Verify no posts are skipped between cache and Nexus transitions
 */

// ============================================================================
// Test Helpers
// ============================================================================

const DEFAULT_AUTHOR = 'user-1';
const MUTED_AUTHOR = 'spammer';
const BASE_TIMESTAMP = 1000000;

const createMockNexusPostsKeyStream = (
  count: number,
  startIndex: number = 1,
  author: string = DEFAULT_AUTHOR,
  startTimestamp: number = BASE_TIMESTAMP,
): NexusPostsKeyStream => {
  const postKeys = Array.from({ length: count }, (_, i) => `${author}:post-${startIndex + i}`);
  const lastPostScore = startTimestamp + count - 1;
  return {
    post_keys: postKeys,
    last_post_score: lastPostScore,
  };
};

const createPostDetails = async (postIds: string[], startTimestamp: number = BASE_TIMESTAMP) => {
  return Promise.all(
    postIds.map((postId, i) =>
      PostDetailsModel.create({
        id: postId,
        content: `Content for ${postId}`,
        kind: 'short',
        indexed_at: startTimestamp + i,
        uri: `https://pubky.app/author/pub/pubky.app/posts/${postId}`,
        attachments: null,
      }),
    ),
  );
};

const createStreamWithPosts = async (streamId: PostStreamId, postIds: string[]) => {
  await PostStreamModel.create(streamId, postIds);
};

const setupMutedUsers = async (mutedUserIds: string[]) => {
  // BaseStreamModel.upsert's static `this` / Table generic does not narrow for UserStreamModel here
  // (tsc error TS2684), but the runtime call matches other tests. Cast keeps the test compiling.
  await (UserStreamModel as { upsert: (id: UserStreamId, stream?: Pubky[]) => Promise<unknown> }).upsert(
    UserStreamTypes.MUTED,
    mutedUserIds as Pubky[],
  );
};

const clearMutedUsers = async () => {
  await UserStreamModel.table.clear();
};

/** Reset all tables + queue state shared by the real-Dexie integration describes. */
const resetStreamTablesAndQueue = async () => {
  await PostStreamModel.table.clear();
  await UnreadPostStreamModel.table.clear();
  await PostDetailsModel.table.clear();
  await UserDetailsModel.table.clear();
  await UserCountsModel.table.clear();
  await UserRelationshipsModel.table.clear();
  await UserTagsModel.table.clear();
  await UserStreamModel.table.clear();
  postStreamQueue.clear();
};

// ============================================================================
// Unit Tests: PostStreamQueue
// ============================================================================

describe('Mute filtering with stream pagination', () => {
  let queue: PostStreamQueue;
  const streamId = 'timeline:all:all' as PostStreamId;

  beforeEach(() => {
    queue = new PostStreamQueue();
  });

  afterEach(() => {
    queue.clear();
    vi.restoreAllMocks();
  });

  // ============================================================================
  // Timestamp handling for cursor advancement
  // ============================================================================

  describe('Timestamp handling for cursor advancement', () => {
    /**
     * Verifies cursor advances correctly when mute filter removes posts from a batch.
     *
     * Scenario:
     * 1. First fetch returns 10 posts, mute filter removes 8, leaving 2 valid
     * 2. Queue needs more posts to fill the limit
     * 3. Timestamp must be set correctly so cursor advances for the next fetch
     *
     * Without proper timestamp handling, posts would be skipped or duplicated.
     */
    it('should advance cursor correctly when cache returns all posts but mute filter removes some', async () => {
      // Setup: Mock post details to return timestamps
      vi.spyOn(PostDetailsModel, 'findById').mockImplementation(async (id) => {
        const idStr = id as string;
        const match = idStr.match(/post-(\d+)/);
        const index = match ? parseInt(match[1]) : 0;
        return {
          id: idStr,
          indexed_at: BASE_TIMESTAMP + index,
          content: `Post ${idStr}`,
          kind: 'short' as const,
          uri: `pubky://author/${idStr}`,
          author: 'author1' as Pubky,
          attachments: null,
        };
      });

      const mutedUserId = 'muted-user';
      const validUserId = 'valid-user';

      let fetchCount = 0;
      const mockFetch = vi.fn(async () => {
        fetchCount++;
        if (fetchCount === 1) {
          // First batch: 8 muted posts + 2 valid posts
          return {
            nextPageIds: [
              `${mutedUserId}:post-0`,
              `${mutedUserId}:post-1`,
              `${validUserId}:post-2`,
              `${mutedUserId}:post-3`,
              `${mutedUserId}:post-4`,
              `${mutedUserId}:post-5`,
              `${mutedUserId}:post-6`,
              `${mutedUserId}:post-7`,
              `${validUserId}:post-8`,
              `${mutedUserId}:post-9`,
            ],
            cacheMissPostIds: [],
            nextCursor: undefined,
          };
        } else {
          return {
            nextPageIds: Array.from({ length: 10 }, (_, i) => `${validUserId}:post-${10 + i}`),
            cacheMissPostIds: [],
            nextCursor: BASE_TIMESTAMP + 19,
          };
        }
      });

      const mutedUserIds = new Set([mutedUserId]);
      const muteFilter = (posts: string[]) =>
        posts.filter((postId) => {
          const userId = postId.split(':')[0];
          return !mutedUserIds.has(userId);
        });

      const result = await queue.collect(streamId, {
        limit: 10,
        cursor: BASE_TIMESTAMP,
        filter: muteFilter,
        fetch: mockFetch,
      });

      expect(result.posts).toHaveLength(10);
      expect(result.nextCursor).toBeDefined();

      // Verify posts are in order and include expected posts
      const validPostNumbers = result.posts.map((id) => {
        const match = id.match(/post-(\d+)/);
        return match ? parseInt(match[1]) : -1;
      });
      expect(validPostNumbers).toContain(2);
      expect(validPostNumbers).toContain(8);
    });

    it('should return correct timestamp when returning from queue early (no fetch needed)', async () => {
      const posts = Array.from({ length: 15 }, (_, i) => `author:post-${i}`);
      queue['save'](streamId, posts, BASE_TIMESTAMP);

      vi.spyOn(PostDetailsModel, 'findById').mockImplementation(async (id) => {
        const idStr = id as string;
        const match = idStr.match(/post-(\d+)/);
        const index = match ? parseInt(match[1]) : 0;
        return {
          id: idStr,
          indexed_at: BASE_TIMESTAMP + index,
          content: `Post ${idStr}`,
          kind: 'short' as const,
          uri: `pubky://author/${idStr}`,
          author: 'author1' as Pubky,
          attachments: null,
        };
      });

      const mockFetch = vi.fn();

      const result = await queue.collect(streamId, {
        limit: 10,
        cursor: BASE_TIMESTAMP,
        filter: (posts) => posts,
        fetch: mockFetch,
      });

      expect(mockFetch).not.toHaveBeenCalled();
      expect(result.posts).toHaveLength(10);
      expect(result.nextCursor).toBe(BASE_TIMESTAMP + 9);
    });
  });

  // ============================================================================
  // End-of-stream detection with filtering
  // ============================================================================

  describe('End-of-stream detection (reachedEnd flag)', () => {
    it('should set reachedEnd=false when hitting MAX_FETCH_ITERATIONS (not actual end)', async () => {
      const mutedUserId = 'muted-user';
      const validUserId = 'valid-user';

      let fetchCount = 0;
      const mockFetch = vi.fn(async () => {
        fetchCount++;
        // Each fetch returns 10 posts, but 9 are from muted user
        return {
          nextPageIds: [
            `${validUserId}:post-${fetchCount}`,
            ...Array.from({ length: 9 }, (_, i) => `${mutedUserId}:post-${fetchCount * 10 + i}`),
          ],
          cacheMissPostIds: [],
          nextCursor: BASE_TIMESTAMP + fetchCount * 10,
        };
      });

      const mutedUserIds = new Set([mutedUserId]);
      const muteFilter = (posts: string[]) => posts.filter((postId) => !mutedUserIds.has(postId.split(':')[0]));

      const result = await queue.collect(streamId, {
        limit: 10,
        cursor: BASE_TIMESTAMP,
        filter: muteFilter,
        fetch: mockFetch,
      });

      // With MAX_FETCH_ITERATIONS=20 and limit=10, we get 10 valid posts (1 per batch)
      // before hitting the iteration cap
      expect(result.posts).toHaveLength(10);
      expect(mockFetch).toHaveBeenCalledTimes(10);
      expect(result.reachedEnd).toBe(false);
    });

    it('should set reachedEnd=true when Nexus returns fewer posts than limit', async () => {
      let fetchCount = 0;
      const mockFetch = vi.fn(async () => {
        fetchCount++;
        if (fetchCount === 1) {
          return {
            nextPageIds: ['author:post-1', 'author:post-2', 'author:post-3'],
            cacheMissPostIds: [],
            nextCursor: BASE_TIMESTAMP + 3,
            reachedEnd: true, // Nexus returned 3 posts when we asked for 10
          };
        }
        return { nextPageIds: [], cacheMissPostIds: [], nextCursor: undefined, reachedEnd: true };
      });

      const result = await queue.collect(streamId, {
        limit: 10,
        cursor: BASE_TIMESTAMP,
        filter: (posts) => posts,
        fetch: mockFetch,
      });

      expect(result.posts).toHaveLength(3);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result.reachedEnd).toBe(true);
    });

    it('should set reachedEnd=false when limit is satisfied normally', async () => {
      const mockFetch = vi.fn(async () => ({
        nextPageIds: Array.from({ length: 10 }, (_, i) => `author:post-${i}`),
        cacheMissPostIds: [],
        nextCursor: BASE_TIMESTAMP + 10,
        reachedEnd: false, // Returned exactly limit, more posts may exist
      }));

      const result = await queue.collect(streamId, {
        limit: 10,
        cursor: BASE_TIMESTAMP,
        filter: (posts) => posts,
        fetch: mockFetch,
      });

      expect(result.posts).toHaveLength(10);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result.reachedEnd).toBe(false);
    });
  });

  // ============================================================================
  // Multi-page pagination with muting
  // ============================================================================

  describe('Multi-page pagination with muting', () => {
    it('should paginate correctly through multiple pages with heavily muted content', async () => {
      vi.spyOn(PostDetailsModel, 'findById').mockImplementation(async (id) => {
        const idStr = id as string;
        const match = idStr.match(/post-(\d+)/);
        const index = match ? parseInt(match[1]) : 0;
        return {
          id: idStr,
          indexed_at: BASE_TIMESTAMP + index,
          content: `Post ${idStr}`,
          kind: 'short' as const,
          uri: `pubky://author/${idStr}`,
          author: 'author1' as Pubky,
          attachments: null,
        };
      });

      const mutedUserId = 'spam-user';
      const validUserId = 'good-user';
      const mutedUserIds = new Set([mutedUserId]);

      let globalPostIndex = 0;
      const mockFetch = vi.fn(async () => {
        const posts: string[] = [];
        for (let i = 0; i < 10; i++) {
          // 70% of posts are from muted user
          const author = i < 7 ? mutedUserId : validUserId;
          posts.push(`${author}:post-${globalPostIndex++}`);
        }
        return {
          nextPageIds: posts,
          cacheMissPostIds: [],
          nextCursor: BASE_TIMESTAMP + globalPostIndex,
        };
      });

      const muteFilter = (posts: string[]) => posts.filter((postId) => !mutedUserIds.has(postId.split(':')[0]));

      // First page
      const result1 = await queue.collect(streamId, {
        limit: 10,
        cursor: BASE_TIMESTAMP,
        filter: muteFilter,
        fetch: mockFetch,
      });

      expect(result1.posts.length).toBeGreaterThanOrEqual(10);
      expect(result1.nextCursor).toBeDefined();

      if (result1.posts.length < 10) {
        expect(result1.reachedEnd).toBe(false);
      }

      // Second page
      const result2 = await queue.collect(streamId, {
        limit: 10,
        cursor: result1.nextCursor!,
        filter: muteFilter,
        fetch: mockFetch,
      });

      expect(result2.nextCursor).toBeDefined();

      // Verify no duplicate posts between pages
      const allPosts = [...result1.posts, ...result2.posts];
      const uniquePosts = new Set(allPosts);
      expect(uniquePosts.size).toBe(allPosts.length);
    });

    it('should continue pagination after mute filter empties several batches', async () => {
      const mutedUserId = 'muted-user';
      const validUserId = 'valid-user';

      let fetchCount = 0;
      const mockFetch = vi.fn(async () => {
        fetchCount++;
        // First 3 fetches are all muted, then we get valid posts
        if (fetchCount <= 3) {
          return {
            nextPageIds: Array.from({ length: 10 }, (_, i) => `${mutedUserId}:post-${fetchCount * 10 + i}`),
            cacheMissPostIds: [],
            nextCursor: BASE_TIMESTAMP + fetchCount * 10,
          };
        }
        return {
          nextPageIds: Array.from({ length: 10 }, (_, i) => `${validUserId}:post-${fetchCount * 10 + i}`),
          cacheMissPostIds: [],
          nextCursor: BASE_TIMESTAMP + fetchCount * 10,
        };
      });

      const mutedUserIds = new Set([mutedUserId]);
      const muteFilter = (posts: string[]) => posts.filter((postId) => !mutedUserIds.has(postId.split(':')[0]));

      const result = await queue.collect(streamId, {
        limit: 10,
        cursor: BASE_TIMESTAMP,
        filter: muteFilter,
        fetch: mockFetch,
      });

      // Should have fetched 4 times to get valid posts
      expect(mockFetch).toHaveBeenCalledTimes(4);
      expect(result.posts).toHaveLength(10);
      expect(result.reachedEnd).toBe(false);
    });
  });
});

// ============================================================================
// Integration Tests: PostStreamApplication with cache
// ============================================================================

describe('PostStreamApplication: Cache and Nexus transitions with muting', () => {
  const streamId = PostStreamTypes.TIMELINE_ALL_ALL as PostStreamId;

  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    await resetStreamTablesAndQueue();
  });

  afterEach(async () => {
    vi.clearAllMocks();
  });

  // ============================================================================
  // Full cache hit returns proper timestamp (Bug 1 fix verification)
  // ============================================================================

  describe('Full cache hit timestamp handling', () => {
    it('should return proper timestamp for full cache hit (not undefined)', async () => {
      // Create cache with 20 posts
      const postIds = Array.from({ length: 20 }, (_, i) => `${DEFAULT_AUTHOR}:post-${i + 1}`);
      await createStreamWithPosts(streamId, postIds);
      await createPostDetails(postIds, BASE_TIMESTAMP);

      const result = await PostStreamApplication.getOrFetchStreamSlice({
        streamId,
        limit: 10,
        streamHead: 0,
        streamTail: 0,
        viewerId: 'user-viewer' as Pubky,
      });

      expect(result.nextPageIds).toHaveLength(10);
      // KEY FIX: timestamp should be defined for full cache hits
      expect(result.nextCursor).toBeDefined();
      expect(result.nextCursor).toBe(BASE_TIMESTAMP + 9); // indexed_at of post-10
    });

    it('should allow cursor to advance correctly after full cache hit', async () => {
      // Create cache with exactly 10 posts (full cache hit for limit=10)
      const postIds = Array.from({ length: 10 }, (_, i) => `${DEFAULT_AUTHOR}:post-${i + 1}`);
      await createStreamWithPosts(streamId, postIds);
      await createPostDetails(postIds, BASE_TIMESTAMP);

      // Mock Nexus for second page
      const mockNexusPostsKeyStream = createMockNexusPostsKeyStream(10, 11, DEFAULT_AUTHOR, BASE_TIMESTAMP + 10);
      vi.spyOn(NexusPostStreamService, 'fetch').mockResolvedValue(mockNexusPostsKeyStream);
      vi.spyOn(LocalStreamPostsService, 'getNotPersistedPostsInCache').mockResolvedValue(
        mockNexusPostsKeyStream.post_keys,
      );

      // First page (full cache hit)
      const result1 = await PostStreamApplication.getOrFetchStreamSlice({
        streamId,
        limit: 10,
        streamHead: 0,
        streamTail: 0,
        viewerId: 'user-viewer' as Pubky,
      });

      expect(result1.nextPageIds).toHaveLength(10);
      expect(result1.nextCursor).toBeDefined();

      // Second page should use the timestamp as cursor
      const result2 = await PostStreamApplication.getOrFetchStreamSlice({
        streamId,
        limit: 10,
        streamHead: 0,
        streamTail: result1.nextCursor!,
        lastPostId: result1.nextPageIds[result1.nextPageIds.length - 1],
        viewerId: 'user-viewer' as Pubky,
      });

      expect(result2.nextPageIds).toHaveLength(10);
      // Verify no overlap between pages
      const allPosts = [...result1.nextPageIds, ...result2.nextPageIds];
      const uniquePosts = new Set(allPosts);
      expect(uniquePosts.size).toBe(20);
    });
  });

  // ============================================================================
  // Cache cleared vs existing cache scenarios
  // ============================================================================

  describe('Cache states: cleared vs existing', () => {
    it('should work correctly with empty cache (fetch from Nexus)', async () => {
      // No cache created - empty
      const mockNexusPostsKeyStream = createMockNexusPostsKeyStream(10, 1, DEFAULT_AUTHOR, BASE_TIMESTAMP);
      vi.spyOn(NexusPostStreamService, 'fetch').mockResolvedValue(mockNexusPostsKeyStream);
      vi.spyOn(LocalStreamPostsService, 'getNotPersistedPostsInCache').mockResolvedValue(
        mockNexusPostsKeyStream.post_keys,
      );

      const result = await PostStreamApplication.getOrFetchStreamSlice({
        streamId,
        limit: 10,
        streamHead: 0,
        streamTail: 0,
        viewerId: 'user-viewer' as Pubky,
      });

      expect(result.nextPageIds).toHaveLength(10);
      expect(result.nextCursor).toBe(BASE_TIMESTAMP + 9);
      expect(NexusPostStreamService.fetch).toHaveBeenCalled();
    });

    it('should work correctly with existing cache (serve from cache)', async () => {
      const postIds = Array.from({ length: 15 }, (_, i) => `${DEFAULT_AUTHOR}:post-${i + 1}`);
      await createStreamWithPosts(streamId, postIds);
      await createPostDetails(postIds, BASE_TIMESTAMP);

      const nexusSpy = vi.spyOn(NexusPostStreamService, 'fetch');

      const result = await PostStreamApplication.getOrFetchStreamSlice({
        streamId,
        limit: 10,
        streamHead: 0,
        streamTail: 0,
        viewerId: 'user-viewer' as Pubky,
      });

      expect(result.nextPageIds).toHaveLength(10);
      // Should NOT call Nexus for full cache hit
      expect(nexusSpy).not.toHaveBeenCalled();
    });

    it('should handle partial cache correctly (combine cache + Nexus)', async () => {
      // Create cache with only 5 posts
      const cachedPostIds = Array.from({ length: 5 }, (_, i) => `${DEFAULT_AUTHOR}:post-${i + 1}`);
      await createStreamWithPosts(streamId, cachedPostIds);
      await createPostDetails(cachedPostIds, BASE_TIMESTAMP);

      // Mock Nexus for remaining posts
      const mockNexusPostsKeyStream = createMockNexusPostsKeyStream(5, 6, DEFAULT_AUTHOR, BASE_TIMESTAMP + 5);
      vi.spyOn(NexusPostStreamService, 'fetch').mockResolvedValue(mockNexusPostsKeyStream);
      vi.spyOn(LocalStreamPostsService, 'getNotPersistedPostsInCache').mockResolvedValue(
        mockNexusPostsKeyStream.post_keys,
      );

      const result = await PostStreamApplication.getOrFetchStreamSlice({
        streamId,
        limit: 10,
        streamHead: 0,
        streamTail: 0,
        viewerId: 'user-viewer' as Pubky,
      });

      // Should combine 5 from cache + 5 from Nexus
      expect(result.nextPageIds).toHaveLength(10);
      expect(NexusPostStreamService.fetch).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // No posts skipped between cache and Nexus transitions
  // ============================================================================

  describe('Cache to Nexus transitions: no skipped posts', () => {
    it('should not skip posts when transitioning from cache to Nexus', async () => {
      // Create cache with posts 1-10
      const cachedPostIds = Array.from({ length: 10 }, (_, i) => `${DEFAULT_AUTHOR}:post-${i + 1}`);
      await createStreamWithPosts(streamId, cachedPostIds);
      await createPostDetails(cachedPostIds, BASE_TIMESTAMP);

      // Mock Nexus to return posts 11-20 (continuation)
      const mockNexusPostsKeyStream = createMockNexusPostsKeyStream(10, 11, DEFAULT_AUTHOR, BASE_TIMESTAMP + 10);
      vi.spyOn(NexusPostStreamService, 'fetch').mockResolvedValue(mockNexusPostsKeyStream);
      vi.spyOn(LocalStreamPostsService, 'getNotPersistedPostsInCache').mockResolvedValue(
        mockNexusPostsKeyStream.post_keys,
      );

      // First page from cache
      const result1 = await PostStreamApplication.getOrFetchStreamSlice({
        streamId,
        limit: 10,
        streamHead: 0,
        streamTail: 0,
        viewerId: 'user-viewer' as Pubky,
      });

      // Second page should transition to Nexus
      const result2 = await PostStreamApplication.getOrFetchStreamSlice({
        streamId,
        limit: 10,
        streamHead: 0,
        streamTail: result1.nextCursor!,
        lastPostId: result1.nextPageIds[result1.nextPageIds.length - 1],
        viewerId: 'user-viewer' as Pubky,
      });

      // Verify sequential post IDs with no gaps
      const allPostNumbers = [...result1.nextPageIds, ...result2.nextPageIds].map((id) => {
        const match = id.match(/post-(\d+)/);
        return match ? parseInt(match[1]) : -1;
      });

      // Should be 1, 2, 3, ..., 20 with no skips
      for (let i = 0; i < 20; i++) {
        expect(allPostNumbers[i]).toBe(i + 1);
      }
    });

    it('should handle cache-to-Nexus transition with muted posts in between', async () => {
      // Create cache with mix of valid and muted posts
      const cachedPostIds = [
        `${DEFAULT_AUTHOR}:post-1`,
        `${DEFAULT_AUTHOR}:post-2`,
        `${MUTED_AUTHOR}:post-3`,
        `${MUTED_AUTHOR}:post-4`,
        `${DEFAULT_AUTHOR}:post-5`,
        `${DEFAULT_AUTHOR}:post-6`,
        `${MUTED_AUTHOR}:post-7`,
        `${DEFAULT_AUTHOR}:post-8`,
        `${DEFAULT_AUTHOR}:post-9`,
        `${DEFAULT_AUTHOR}:post-10`,
      ];
      await createStreamWithPosts(streamId, cachedPostIds);
      await createPostDetails(cachedPostIds, BASE_TIMESTAMP);

      // Setup muted users
      await setupMutedUsers([MUTED_AUTHOR]);

      // Mock Nexus for additional posts (all valid)
      const mockNexusPostsKeyStream = createMockNexusPostsKeyStream(10, 11, DEFAULT_AUTHOR, BASE_TIMESTAMP + 10);
      vi.spyOn(NexusPostStreamService, 'fetch').mockResolvedValue(mockNexusPostsKeyStream);
      vi.spyOn(LocalStreamPostsService, 'getNotPersistedPostsInCache').mockResolvedValue(
        mockNexusPostsKeyStream.post_keys,
      );

      const result = await PostStreamApplication.getOrFetchStreamSlice({
        streamId,
        limit: 10,
        streamHead: 0,
        streamTail: 0,
        viewerId: 'user-viewer' as Pubky,
      });

      // Should have filtered out muted posts
      expect(result.nextPageIds.every((id) => !id.startsWith(MUTED_AUTHOR))).toBe(true);
      expect(result.nextCursor).toBeDefined();
    });
  });

  // ============================================================================
  // Unmute behavior verification
  // ============================================================================

  describe('Unmute behavior', () => {
    it('should include previously muted posts after unmuting', async () => {
      // Create cache with mixed posts - need enough that mute filter still returns limit
      // With 20 posts, 10 non-muted, requesting 5 should work without Nexus
      const cachedPostIds: string[] = [];
      for (let i = 1; i <= 20; i++) {
        // Alternate authors: odd = DEFAULT_AUTHOR, even = MUTED_AUTHOR
        const author = i % 2 === 1 ? DEFAULT_AUTHOR : MUTED_AUTHOR;
        cachedPostIds.push(`${author}:post-${i}`);
      }
      await createStreamWithPosts(streamId, cachedPostIds);
      await createPostDetails(cachedPostIds, BASE_TIMESTAMP);

      // Mock Nexus to return more posts if queue needs them (due to mute filtering)
      const mockNexusKeyStream = createMockNexusPostsKeyStream(10, 21, DEFAULT_AUTHOR, BASE_TIMESTAMP + 20);
      vi.spyOn(NexusPostStreamService, 'fetch').mockResolvedValue(mockNexusKeyStream);
      vi.spyOn(LocalStreamPostsService, 'getNotPersistedPostsInCache').mockResolvedValue([]);
      vi.spyOn(LocalStreamPostsService, 'persistNewStreamChunk').mockResolvedValue(undefined);

      // First: with muted user
      await setupMutedUsers([MUTED_AUTHOR]);

      const resultMuted = await PostStreamApplication.getOrFetchStreamSlice({
        streamId,
        limit: 5,
        streamHead: 0,
        streamTail: 0,
        viewerId: 'user-viewer' as Pubky,
      });

      // Should only have non-muted posts
      const mutedPostsInResult = resultMuted.nextPageIds.filter((id) => id.startsWith(MUTED_AUTHOR));
      expect(mutedPostsInResult).toHaveLength(0);
      expect(resultMuted.nextPageIds.length).toBe(5);

      // Clear the queue to simulate fresh pagination
      postStreamQueue.clear();

      // Now: unmute the user
      await clearMutedUsers();

      const resultUnmuted = await PostStreamApplication.getOrFetchStreamSlice({
        streamId,
        limit: 10,
        streamHead: 0,
        streamTail: 0,
        viewerId: 'user-viewer' as Pubky,
      });

      // Should now include all posts (including previously muted)
      expect(resultUnmuted.nextPageIds).toHaveLength(10);
      const unmutedPostsInResult = resultUnmuted.nextPageIds.filter((id) => id.startsWith(MUTED_AUTHOR));
      expect(unmutedPostsInResult.length).toBeGreaterThan(0);
    });

    it('should continue pagination correctly after unmuting mid-scroll', async () => {
      // Create a larger cache
      const cachedPostIds: string[] = [];
      for (let i = 1; i <= 40; i++) {
        // 1 in 3 posts is from muted author
        const author = i % 3 === 0 ? MUTED_AUTHOR : DEFAULT_AUTHOR;
        cachedPostIds.push(`${author}:post-${i}`);
      }
      await createStreamWithPosts(streamId, cachedPostIds);
      await createPostDetails(cachedPostIds, BASE_TIMESTAMP);

      // Mock Nexus in case queue needs more posts
      const mockNexusKeyStream = createMockNexusPostsKeyStream(10, 41, DEFAULT_AUTHOR, BASE_TIMESTAMP + 40);
      vi.spyOn(NexusPostStreamService, 'fetch').mockResolvedValue(mockNexusKeyStream);
      vi.spyOn(LocalStreamPostsService, 'getNotPersistedPostsInCache').mockResolvedValue([]);
      vi.spyOn(LocalStreamPostsService, 'persistNewStreamChunk').mockResolvedValue(undefined);

      // Start with muted user
      await setupMutedUsers([MUTED_AUTHOR]);

      // First page with muting active
      const result1 = await PostStreamApplication.getOrFetchStreamSlice({
        streamId,
        limit: 5,
        streamHead: 0,
        streamTail: 0,
        viewerId: 'user-viewer' as Pubky,
      });

      expect(result1.nextPageIds.every((id) => !id.startsWith(MUTED_AUTHOR))).toBe(true);
      expect(result1.nextCursor).toBeDefined();

      // Unmute mid-scroll. The queue clear simulates continuing after a queue reset
      // (stream change / refresh) — production unmute deliberately preserves the queue,
      // covered by 'mute mid-scroll re-filters the overflow buffer instead of skipping past it'.
      await clearMutedUsers();
      postStreamQueue.clear();

      // Second page after unmuting - should continue from where we left off
      const result2 = await PostStreamApplication.getOrFetchStreamSlice({
        streamId,
        limit: 5,
        streamHead: 0,
        streamTail: result1.nextCursor!,
        lastPostId: result1.nextPageIds[result1.nextPageIds.length - 1],
        viewerId: 'user-viewer' as Pubky,
      });

      // Key assertions: pagination continues correctly after unmuting
      expect(result2.nextPageIds.length).toBeGreaterThan(0);
      expect(result2.nextCursor).toBeDefined();

      // Note: Some overlap is acceptable when unmuting mid-scroll because
      // previously filtered posts become visible. The important thing is
      // that pagination continues and returns valid posts.
      // The UI layer (useStreamPagination) handles deduplication.
    });
  });

  // ============================================================================
  // reachedEnd flag propagation through layers
  // ============================================================================

  describe('reachedEnd flag propagation', () => {
    it('should propagate reachedEnd=true when stream actually ends', async () => {
      // Create small cache that ends
      const postIds = Array.from({ length: 5 }, (_, i) => `${DEFAULT_AUTHOR}:post-${i + 1}`);
      await createStreamWithPosts(streamId, postIds);
      await createPostDetails(postIds, BASE_TIMESTAMP);

      // Mock Nexus to return empty (end of stream)
      vi.spyOn(NexusPostStreamService, 'fetch').mockResolvedValue({
        post_keys: [],
        last_post_score: 0,
      });

      const result = await PostStreamApplication.getOrFetchStreamSlice({
        streamId,
        limit: 10,
        streamHead: 0,
        streamTail: BASE_TIMESTAMP + 4,
        lastPostId: `${DEFAULT_AUTHOR}:post-5`,
        viewerId: 'user-viewer' as Pubky,
      });

      expect(result.reachedEnd).toBe(true);
    });

    it('should propagate reachedEnd=false when more posts may exist', async () => {
      const postIds = Array.from({ length: 10 }, (_, i) => `${DEFAULT_AUTHOR}:post-${i + 1}`);
      await createStreamWithPosts(streamId, postIds);
      await createPostDetails(postIds, BASE_TIMESTAMP);

      const result = await PostStreamApplication.getOrFetchStreamSlice({
        streamId,
        limit: 10,
        streamHead: 0,
        streamTail: 0,
        viewerId: 'user-viewer' as Pubky,
      });

      // Full cache hit with exactly limit posts - might have more
      expect(result.reachedEnd).toBe(false);
    });
  });
});

// ============================================================================
// Raw resume anchor across fully-filtered cache runs (#2251 follow-up)
// ============================================================================
//
// The cache walk (`getStreamFromCache`) pages by `lastPostId` and ignores the
// backend cursor. When a whole round is filtered to zero visible posts, the
// caller has no visible id to anchor to — `lastRawPostId` (the last RAW post
// scanned, visible or filtered) is what lets the next round resume instead of
// restarting at the cache head and livelocking on runs of
// limit × MAX_FETCH_ITERATIONS (= 200) consecutive filtered posts.
//
// These tests simulate useStreamPagination's exact cross-round behavior:
// each round threads `lastPostId = previous lastRawPostId` and
// `streamTail = previous nextCursor`.
describe('Raw resume anchor (lastRawPostId) across fully-filtered cache runs', () => {
  const streamId = PostStreamTypes.TIMELINE_ALL_ALL as PostStreamId;
  const viewerId = 'user-viewer' as Pubky;
  const LIMIT = 10;

  /** Details with descending indexed_at so array order matches newest-first stream order. */
  const createDetailsForRun = async (postIds: string[], kind: string, newestTs: number, content?: string) => {
    await Promise.all(
      postIds.map((postId, i) =>
        PostDetailsModel.create({
          id: postId,
          content: content ?? `Content for ${postId}`,
          kind,
          indexed_at: newestTs - i,
          uri: `https://pubky.app/author/pub/pubky.app/posts/${postId}`,
          attachments: null,
        }),
      ),
    );
  };

  /** One useStreamPagination round: resume from the previous round's raw anchor + cursor. */
  const runRound = async (anchor: { lastPostId?: string; streamTail: number }) => {
    return await PostStreamApplication.getOrFetchStreamSlice({
      streamId,
      limit: LIMIT,
      streamHead: 0,
      streamTail: anchor.streamTail,
      lastPostId: anchor.lastPostId,
      viewerId,
    });
  };

  const nextAnchor = (
    result: Awaited<ReturnType<typeof runRound>>,
    prev: { lastPostId?: string; streamTail: number },
  ) => ({
    lastPostId: result.lastRawPostId ?? prev.lastPostId,
    streamTail: result.nextCursor ?? prev.streamTail,
  });

  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    await resetStreamTablesAndQueue();
  });

  afterEach(async () => {
    vi.clearAllMocks();
  });

  it('resumes past a 200-post collection run at the cache head and surfaces the real posts on round 2 (QA livelock repro)', async () => {
    // Cache head: 200 collections (newest, filtered out of this stream), then 10 real posts.
    const collectionIds = Array.from({ length: 200 }, (_, i) => `qa-user:coll-${i + 1}`);
    const realIds = Array.from({ length: 10 }, (_, i) => `${DEFAULT_AUTHOR}:real-${i + 1}`);
    await createDetailsForRun(collectionIds, 'collection', BASE_TIMESTAMP + 1000);
    await createDetailsForRun(realIds, 'short', BASE_TIMESTAMP);
    await createStreamWithPosts(streamId, [...collectionIds, ...realIds]);

    // The real posts are in the cache; Nexus must never be needed.
    const nexusSpy = vi.spyOn(NexusPostStreamService, 'fetch').mockResolvedValue({
      post_keys: [],
      last_post_score: null,
    });

    // Round 1 (initial load): the whole iteration budget is consumed inside the run.
    const seed = await PostStreamApplication.getCachedLastPostTimestamp({ streamId });
    const round1 = await runRound({ lastPostId: undefined, streamTail: seed });
    expect(round1.nextPageIds).toHaveLength(0);
    expect(round1.reachedEnd).toBe(false);
    // The raw anchor still advanced through the whole scanned run.
    expect(round1.lastRawPostId).toBe('qa-user:coll-200');

    // Round 2: resuming from the raw anchor lands directly on the real posts.
    const round2 = await runRound(nextAnchor(round1, { streamTail: seed }));
    expect(round2.nextPageIds).toEqual(realIds);
    expect(nexusSpy).not.toHaveBeenCalled();
  });

  it('resumes past a 200-post deleted-tombstone run', async () => {
    const deletedIds = Array.from({ length: 200 }, (_, i) => `qa-user:gone-${i + 1}`);
    const realIds = Array.from({ length: 10 }, (_, i) => `${DEFAULT_AUTHOR}:real-${i + 1}`);
    await createDetailsForRun(deletedIds, 'short', BASE_TIMESTAMP + 1000, DELETED);
    await createDetailsForRun(realIds, 'short', BASE_TIMESTAMP);
    await createStreamWithPosts(streamId, [...deletedIds, ...realIds]);

    const nexusSpy = vi.spyOn(NexusPostStreamService, 'fetch').mockResolvedValue({
      post_keys: [],
      last_post_score: null,
    });

    const seed = await PostStreamApplication.getCachedLastPostTimestamp({ streamId });
    const round1 = await runRound({ lastPostId: undefined, streamTail: seed });
    expect(round1.nextPageIds).toHaveLength(0);
    expect(round1.reachedEnd).toBe(false);
    expect(round1.lastRawPostId).toBe('qa-user:gone-200');

    const round2 = await runRound(nextAnchor(round1, { streamTail: seed }));
    expect(round2.nextPageIds).toEqual(realIds);
    expect(nexusSpy).not.toHaveBeenCalled();
  });

  it('resumes past an interior filtered run (anchor mid-stream)', async () => {
    // 10 real posts, then a 200-collection run, then 10 more real posts.
    const newestRealIds = Array.from({ length: 10 }, (_, i) => `${DEFAULT_AUTHOR}:real-${i + 1}`);
    const collectionIds = Array.from({ length: 200 }, (_, i) => `qa-user:coll-${i + 1}`);
    const oldestRealIds = Array.from({ length: 10 }, (_, i) => `${DEFAULT_AUTHOR}:real-${i + 11}`);
    await createDetailsForRun(newestRealIds, 'short', BASE_TIMESTAMP + 3000);
    await createDetailsForRun(collectionIds, 'collection', BASE_TIMESTAMP + 2000);
    await createDetailsForRun(oldestRealIds, 'short', BASE_TIMESTAMP + 1000);
    await createStreamWithPosts(streamId, [...newestRealIds, ...collectionIds, ...oldestRealIds]);

    vi.spyOn(NexusPostStreamService, 'fetch').mockResolvedValue({
      post_keys: [],
      last_post_score: null,
    });

    const seed = await PostStreamApplication.getCachedLastPostTimestamp({ streamId });
    let anchor: { lastPostId?: string; streamTail: number } = { lastPostId: undefined, streamTail: seed };

    const round1 = await runRound(anchor);
    expect(round1.nextPageIds).toEqual(newestRealIds);
    anchor = nextAnchor(round1, anchor);

    // Round 2 burns its whole budget inside the interior run — empty, but anchored past it.
    const round2 = await runRound(anchor);
    expect(round2.nextPageIds).toHaveLength(0);
    expect(round2.reachedEnd).toBe(false);
    expect(round2.lastRawPostId).toBe('qa-user:coll-200');
    anchor = nextAnchor(round2, anchor);

    const round3 = await runRound(anchor);
    expect(round3.nextPageIds).toEqual(oldestRealIds);
  });

  it('surfaces posts within one round when the filtered run is under limit×maxIterations (contrast)', async () => {
    // 190 consecutive collections: the round's final iteration walks past the run.
    const collectionIds = Array.from({ length: 190 }, (_, i) => `qa-user:coll-${i + 1}`);
    const realIds = Array.from({ length: 10 }, (_, i) => `${DEFAULT_AUTHOR}:real-${i + 1}`);
    await createDetailsForRun(collectionIds, 'collection', BASE_TIMESTAMP + 1000);
    await createDetailsForRun(realIds, 'short', BASE_TIMESTAMP);
    await createStreamWithPosts(streamId, [...collectionIds, ...realIds]);

    vi.spyOn(NexusPostStreamService, 'fetch').mockResolvedValue({
      post_keys: [],
      last_post_score: null,
    });

    const seed = await PostStreamApplication.getCachedLastPostTimestamp({ streamId });
    const round1 = await runRound({ lastPostId: undefined, streamTail: seed });
    expect(round1.nextPageIds).toEqual(realIds);
  });

  it('mute mid-scroll re-filters the overflow buffer instead of skipping past it', async () => {
    // With a raw resume anchor, clearing the queue on mute would skip the buffered
    // posts (the anchor already points past them). The mute service therefore keeps
    // the buffer, and collect() re-filters it with the fresh mute list on read.
    const rawPage: NexusPostsKeyStream = {
      post_keys: [
        ...Array.from({ length: 10 }, (_, i) => `${DEFAULT_AUTHOR}:post-${i + 1}`),
        `${MUTED_AUTHOR}:post-11`,
        `${MUTED_AUTHOR}:post-12`,
        `${DEFAULT_AUTHOR}:post-13`,
        `${DEFAULT_AUTHOR}:post-14`,
        `${DEFAULT_AUTHOR}:post-15`,
      ],
      last_post_score: BASE_TIMESTAMP + 14,
    };
    const nexusSpy = vi.spyOn(NexusPostStreamService, 'fetch').mockResolvedValue(rawPage);

    // Round 1 overflows: 10 returned, 5 buffered (2 from the soon-muted author).
    const round1 = await runRound({ lastPostId: undefined, streamTail: 0 });
    expect(round1.nextPageIds).toHaveLength(10);
    expect(round1.lastRawPostId).toBe(`${DEFAULT_AUTHOR}:post-15`);

    // User mutes the author mid-scroll — the buffer must survive.
    await LocalMuteService.create({ muter: viewerId, mutee: MUTED_AUTHOR as Pubky });
    expect(postStreamQueue.get(streamId)?.posts).toHaveLength(5);

    // Round 2 is served from the re-filtered buffer: muted posts dropped, the
    // remaining buffered posts still delivered, no Nexus round trip.
    nexusSpy.mockClear();
    const round2 = await PostStreamApplication.getOrFetchStreamSlice({
      streamId,
      limit: 3,
      streamHead: 0,
      streamTail: round1.nextCursor ?? 0,
      lastPostId: round1.lastRawPostId,
      viewerId,
    });
    expect(round2.nextPageIds).toEqual([
      `${DEFAULT_AUTHOR}:post-13`,
      `${DEFAULT_AUTHOR}:post-14`,
      `${DEFAULT_AUTHOR}:post-15`,
    ]);
    expect(nexusSpy).not.toHaveBeenCalled();
    // Buffer-only round: the raw anchor holds at the caller's own position.
    expect(round2.lastRawPostId).toBe(`${DEFAULT_AUTHOR}:post-15`);
  });
});
