import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FileApplication } from '@/application/file/file';
import { PostStreamApplication } from '@/application/stream/posts/post';
import { STREAM_CACHE_MAX_AGE_MS } from '@/config/nexus';
import { FORCE_FETCH_NEW_POSTS, SKIP_FETCH_NEW_POSTS } from '@/controllers/stream/posts/post.constants';
import type { Pubky } from '@/models/models.types';
import { PostCountsModel } from '@/models/post/counts/postCounts';
import { PostDetailsModel } from '@/models/post/details/postDetails';
import { DELETED } from '@/models/post/details/postDetails.constants';
import { PostRelationshipsModel } from '@/models/post/relationships/postRelationships';
import { type PostStreamId, PostStreamTypes } from '@/models/stream/post/postStream.types';
import { PostStreamModel } from '@/models/stream/post/tables/postStream';
import { UnreadPostStreamModel } from '@/models/stream/post/tables/postStream.unread';
import { UserStreamModel } from '@/models/stream/user/userStream';
import { UserStreamTypes } from '@/models/stream/user/userStream.types';
import { UserCountsModel } from '@/models/user/counts/userCounts';
import { UserDetailsModel } from '@/models/user/details/userDetails';
import type { UserDetailsModelSchema } from '@/models/user/details/userDetails.schema';
import { UserRelationshipsModel } from '@/models/user/relationships/userRelationships';
import { UserTagsModel } from '@/models/user/tags/userTags';
import { LocalStreamPostsService } from '@/services/local/stream/posts/posts';
import { LocalStreamUsersService } from '@/services/local/stream/users/users';
import {
  type NexusFileDetails,
  type NexusFileUrls,
  type NexusPost,
  type NexusPostsKeyStream,
  type NexusUser,
  StreamSorting,
} from '@/services/nexus/nexus.types';
import { NexusPostStreamService } from '@/services/nexus/stream/posts/postStream';
import { NexusUserStreamService } from '@/services/nexus/stream/users/userStream';
import { asInvalid } from '@/test-utils/type-assertions';
import { MuteFilter } from './muting/mute-filter';
import { postStreamQueue } from './muting/post-stream-queue';

describe('PostStreamApplication', () => {
  const streamId = PostStreamTypes.TIMELINE_ALL_ALL as PostStreamId;
  const DEFAULT_AUTHOR = 'user-1';
  const BASE_TIMESTAMP = 1000000;

  // ============================================================================
  // Test Helpers
  // ============================================================================

  const createMockNexusPost = (
    postId: string,
    author: string = DEFAULT_AUTHOR,
    timestamp: number = BASE_TIMESTAMP,
    overrides?: Partial<NexusPost>,
  ): NexusPost => ({
    details: {
      id: postId,
      content: `Post ${postId} content`,
      kind: 'short' as const,
      uri: `https://pubky.app/${author}/pub/pubky.app/posts/${postId}`,
      author,
      indexed_at: timestamp,
      attachments: null,
      ...overrides?.details,
    },
    counts: {
      replies: 0,
      tags: 0,
      unique_tags: 0,
      reposts: 0,
      ...overrides?.counts,
    },
    tags: [],
    relationships: {
      replied: null,
      reposted: null,
      mentioned: [],
      ...overrides?.relationships,
    },
    bookmark: null,
    ...overrides,
  });

  const createMockNexusPosts = (
    count: number,
    startIndex: number = 1,
    author: string = DEFAULT_AUTHOR,
    startTimestamp: number = BASE_TIMESTAMP,
  ): NexusPost[] => {
    return Array.from({ length: count }, (_, i) => {
      const postId = `post-${startIndex + i}`;
      return createMockNexusPost(postId, author, startTimestamp + i);
    });
  };

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

  const createMockNexusUser = (userId: string = DEFAULT_AUTHOR, overrides?: Partial<NexusUser>): NexusUser => ({
    details: {
      id: userId,
      name: `User ${userId}`,
      bio: 'Bio',
      links: null,
      status: null,
      image: null,
      indexed_at: BASE_TIMESTAMP,
      ...overrides?.details,
    },
    counts: {
      tagged: 0,
      tags: 0,
      unique_tags: 0,
      posts: 0,
      replies: 0,
      following: 0,
      followers: 0,
      friends: 0,
      bookmarks: 0,
      ...overrides?.counts,
    },
    tags: [],
    relationship: {
      following: false,
      followed_by: false,
      ...overrides?.relationship,
    },
    ...overrides,
  });

  const createPostDetails = async (postIds: string[], startTimestamp: number = BASE_TIMESTAMP) => {
    return Promise.all(
      postIds.map((postId, i) =>
        PostDetailsModel.create({
          id: postId,
          content: `Content for ${postId}`,
          kind: 'short',
          indexed_at: startTimestamp + i,
          uri: `https://pubky.app/${DEFAULT_AUTHOR}/pub/pubky.app/posts/post-${i + 1}`,
          attachments: null,
        }),
      ),
    );
  };

  const createPostDetailWithTimestamp = async (postId: string, indexedAt: number) => {
    await PostDetailsModel.create({
      id: postId,
      content: `Content for ${postId}`,
      kind: 'short',
      indexed_at: indexedAt,
      uri: `https://pubky.app/${DEFAULT_AUTHOR}/pub/pubky.app/posts/${postId}`,
      attachments: null,
    });
  };

  const createStreamWithPosts = async (postIds: string[]) => {
    await PostStreamModel.create(streamId, postIds);
  };

  const expectPostIds = (result: string[], start: number, count: number, author = DEFAULT_AUTHOR) => {
    const expected = Array.from({ length: count }, (_, i) => `${author}:post-${start + i}`);
    expect(result).toEqual(expected);
  };

  const createTestData = (postCount = 1, author = DEFAULT_AUTHOR) => ({
    cacheMissPostIds: Array.from({ length: postCount }, (_, i) => `${author}:post-${i + 1}`),
    mockNexusPosts: createMockNexusPosts(postCount, 1, author),
  });

  const setupDefaultMocks = () => ({
    persistPosts: vi.spyOn(LocalStreamPostsService, 'persistPosts').mockResolvedValue({ attachmentMetadata: [] }),
    persistFiles: vi.spyOn(FileApplication, 'persistFiles').mockResolvedValue(undefined),
    getUserDetails: vi.spyOn(UserDetailsModel, 'findByIdsPreserveOrder'),
  });

  const mockAllUsersCached = (count = 1, author = DEFAULT_AUTHOR) => {
    return Array.from({ length: count }, () => ({ id: author }) as UserDetailsModelSchema);
  };

  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.clearAllMocks();

    await PostStreamModel.table.clear();
    await UnreadPostStreamModel.table.clear();
    postStreamQueue.clear();
    await PostDetailsModel.table.clear();
    await UserDetailsModel.table.clear();
    await UserCountsModel.table.clear();
    await UserRelationshipsModel.table.clear();
    await UserTagsModel.table.clear();
    await UserStreamModel.table.clear();
  });

  afterEach(async () => {
    vi.clearAllMocks();
  });

  // ============================================================================
  // Tests
  // ============================================================================

  describe('getOrFetchStreamSlice', () => {
    it('should return posts from cache when available (no cursor)', async () => {
      const postIds = Array.from({ length: 20 }, (_, i) => `${DEFAULT_AUTHOR}:post-${i + 1}`);
      await createStreamWithPosts(postIds);

      const result = await PostStreamApplication.getOrFetchStreamSlice({
        streamId,
        limit: 10,
        streamHead: 0,
        streamTail: 0,
        viewerId: 'user-viewer' as Pubky,
      });

      expect(result.nextPageIds).toHaveLength(10);
      expect(result.nextPageIds).toEqual(postIds.slice(0, 10));
      expect(result.cacheMissPostIds).toEqual([]);
      expect(result.timestamp).toBeUndefined();
    });

    it('should fetch from Nexus when cache is empty', async () => {
      const mockNexusPostsKeyStream = createMockNexusPostsKeyStream(5);
      vi.spyOn(NexusPostStreamService, 'fetch').mockResolvedValue(mockNexusPostsKeyStream);
      await createStreamWithPosts([]);

      const result = await PostStreamApplication.getOrFetchStreamSlice({
        streamId,
        limit: 10,
        streamHead: 0,
        streamTail: 0,
        viewerId: 'user-viewer' as Pubky,
      });

      expect(result.nextPageIds).toHaveLength(5);
      expectPostIds(result.nextPageIds, 1, 5);
      expect(result.timestamp).toBe(BASE_TIMESTAMP + 4);
      expect(result.cacheMissPostIds).toHaveLength(5);
      expect(result.cacheMissPostIds).toEqual(result.nextPageIds);

      const cached = await PostStreamModel.findById(streamId);
      expect(cached?.stream).toEqual(result.nextPageIds);
    });

    it('should paginate using cursor (post_id and timestamp)', async () => {
      const initialPostIds = Array.from({ length: 5 }, (_, i) => `${DEFAULT_AUTHOR}:post-${i + 1}`);
      await createStreamWithPosts(initialPostIds);
      await createPostDetails(initialPostIds);

      const mockNexusPostsKeyStream = createMockNexusPostsKeyStream(5, 6, DEFAULT_AUTHOR, BASE_TIMESTAMP + 5);
      vi.spyOn(NexusPostStreamService, 'fetch').mockResolvedValue(mockNexusPostsKeyStream);

      const result = await PostStreamApplication.getOrFetchStreamSlice({
        streamId,
        limit: 10,
        streamHead: 0,
        lastPostId: `${DEFAULT_AUTHOR}:post-5`,
        streamTail: BASE_TIMESTAMP + 4,
        viewerId: 'user-viewer' as Pubky,
      });

      expect(result.nextPageIds).toHaveLength(5);
      expectPostIds(result.nextPageIds, 6, 5);
      expect(result.timestamp).toBe(BASE_TIMESTAMP + 9);

      const cached = await PostStreamModel.findById(streamId);
      expect(cached?.stream).toHaveLength(10);
    });

    it('should return empty array when no more posts available', async () => {
      const postIds = [`${DEFAULT_AUTHOR}:post-1`, `${DEFAULT_AUTHOR}:post-2`];
      await createStreamWithPosts(postIds);
      await createPostDetails(postIds);
      vi.spyOn(NexusPostStreamService, 'fetch').mockResolvedValue({
        post_keys: [],
        last_post_score: 0,
      });

      const result = await PostStreamApplication.getOrFetchStreamSlice({
        streamId,
        limit: 10,
        lastPostId: `${DEFAULT_AUTHOR}:post-2`,
        streamHead: 0,
        streamTail: BASE_TIMESTAMP + 1,
        viewerId: 'user-viewer' as Pubky,
      });

      expect(result.nextPageIds).toHaveLength(0);
      expect(result.cacheMissPostIds).toEqual([]);
    });

    it('should fetch from Nexus when cache has insufficient posts and combine results', async () => {
      // Create cache with only 3 posts (less than limit of 10)
      const cachedPostIds = Array.from({ length: 3 }, (_, i) => `${DEFAULT_AUTHOR}:post-${i + 1}`);
      await createStreamWithPosts(cachedPostIds);
      await createPostDetails(cachedPostIds);

      // Mock more posts from Nexus
      const mockNexusPostsKeyStream = createMockNexusPostsKeyStream(5, 4, DEFAULT_AUTHOR, BASE_TIMESTAMP + 3);
      vi.spyOn(NexusPostStreamService, 'fetch').mockResolvedValue(mockNexusPostsKeyStream);

      // Request 10 posts, but cache only has 3
      const result = await PostStreamApplication.getOrFetchStreamSlice({
        streamId,
        limit: 10,
        streamTail: 0,
        streamHead: 0,
        viewerId: 'user-viewer' as Pubky,
      });

      // Should combine cached posts (3) + fetched posts (5) = 8 total
      expect(result.nextPageIds).toHaveLength(8);
      // First 3 should be from cache
      expectPostIds(result.nextPageIds.slice(0, 3), 1, 3);
      // Next 5 should be from Nexus
      expectPostIds(result.nextPageIds.slice(3, 8), 4, 5);
    });

    it('should handle error when getting timestamp from post ID', async () => {
      const postIds = Array.from({ length: 5 }, (_, i) => `${DEFAULT_AUTHOR}:post-${i + 1}`);
      await createStreamWithPosts(postIds);

      vi.spyOn(PostDetailsModel, 'findById').mockRejectedValue(new Error('Database error'));
      const mockNexusPostsKeyStream = createMockNexusPostsKeyStream(5, 6, DEFAULT_AUTHOR, BASE_TIMESTAMP + 5);
      vi.spyOn(NexusPostStreamService, 'fetch').mockResolvedValue(mockNexusPostsKeyStream);

      const result = await PostStreamApplication.getOrFetchStreamSlice({
        streamId,
        limit: 10,
        streamHead: 0,
        lastPostId: `${DEFAULT_AUTHOR}:post-5`,
        streamTail: BASE_TIMESTAMP + 4,
        viewerId: 'user-viewer' as Pubky,
      });

      expect(result.nextPageIds).toHaveLength(5);
    });

    it('should handle when cache has exactly limit number of posts', async () => {
      const postIds = Array.from({ length: 10 }, (_, i) => `${DEFAULT_AUTHOR}:post-${i + 1}`);
      await createStreamWithPosts(postIds);
      await createPostDetails(postIds);

      const nexusFetchSpy = vi.spyOn(NexusPostStreamService, 'fetch');

      const result = await PostStreamApplication.getOrFetchStreamSlice({
        streamId,
        limit: 10,
        streamTail: 0,
        streamHead: 0,
        viewerId: DEFAULT_AUTHOR,
      });

      expect(result.nextPageIds).toHaveLength(10);
      expect(result.nextPageIds).toEqual(postIds);
      expect(result.cacheMissPostIds).toEqual([]);
      // Full cache hit returns timestamp of last post for pagination cursor advancement
      expect(result.timestamp).toBe(BASE_TIMESTAMP + 9);
      // Full cache hit should not fetch from Nexus
      expect(nexusFetchSpy).not.toHaveBeenCalled();
    });

    it('should handle when cache has posts but not enough after post_id', async () => {
      const postIds = Array.from({ length: 5 }, (_, i) => `${DEFAULT_AUTHOR}:post-${i + 1}`);
      await createStreamWithPosts(postIds);
      await createPostDetails(postIds);

      const mockNexusPostsKeyStream = createMockNexusPostsKeyStream(5, 6, DEFAULT_AUTHOR, BASE_TIMESTAMP + 5);
      vi.spyOn(NexusPostStreamService, 'fetch').mockResolvedValue(mockNexusPostsKeyStream);

      const result = await PostStreamApplication.getOrFetchStreamSlice({
        streamId,
        limit: 10,
        streamHead: 0,
        lastPostId: `${DEFAULT_AUTHOR}:post-3`,
        streamTail: BASE_TIMESTAMP + 2,
        viewerId: DEFAULT_AUTHOR,
      });

      // Cache has 2 posts after post-3: [post-4, post-5]
      // Fetches 5 more from Nexus: [post-6, post-7, post-8, post-9, post-10]
      // Total: 7 posts (2 cached + 5 fetched)
      expect(result.nextPageIds).toHaveLength(7);
      // First 2 should be from cache
      expectPostIds(result.nextPageIds.slice(0, 2), 4, 2);
      // Next 5 should be from Nexus
      expectPostIds(result.nextPageIds.slice(2, 7), 6, 5);
    });

    it('should propagate error when NexusPostStreamService.fetch fails', async () => {
      await createStreamWithPosts([]);
      vi.spyOn(NexusPostStreamService, 'fetch').mockRejectedValue(new Error('Network error'));

      await expect(
        PostStreamApplication.getOrFetchStreamSlice({
          streamId,
          limit: 10,
          streamTail: 0,
          streamHead: 0,
          viewerId: DEFAULT_AUTHOR,
        }),
      ).rejects.toThrow('Network error');
    });

    it('should propagate error when persistNewStreamChunk fails (stream write operation)', async () => {
      await createStreamWithPosts([]);
      const mockNexusPostsKeyStream = createMockNexusPostsKeyStream(5);
      vi.spyOn(NexusPostStreamService, 'fetch').mockResolvedValue(mockNexusPostsKeyStream);
      vi.spyOn(LocalStreamPostsService, 'persistNewStreamChunk').mockRejectedValue(
        new Error('Failed to persist stream chunk'),
      );

      await expect(
        PostStreamApplication.getOrFetchStreamSlice({
          streamId,
          limit: 10,
          streamTail: 0,
          streamHead: 0,
          viewerId: DEFAULT_AUTHOR,
        }),
      ).rejects.toThrow('Failed to persist stream chunk');
    });

    it('should propagate error when getNotPersistedPostsInCache fails (post details read operation)', async () => {
      await createStreamWithPosts([]);
      const mockNexusPostsKeyStream = createMockNexusPostsKeyStream(5);
      vi.spyOn(NexusPostStreamService, 'fetch').mockResolvedValue(mockNexusPostsKeyStream);
      vi.spyOn(LocalStreamPostsService, 'persistNewStreamChunk').mockResolvedValue(undefined);

      const findByIdsSpy = vi
        .spyOn(PostDetailsModel, 'findByIdsPreserveOrder')
        .mockRejectedValue(new Error('Database query failed'));

      await expect(
        PostStreamApplication.getOrFetchStreamSlice({
          streamId,
          limit: 10,
          streamTail: 0,
          streamHead: 0,
          viewerId: DEFAULT_AUTHOR,
        }),
      ).rejects.toThrow('Database query failed');

      findByIdsSpy.mockRestore();
    });

    it('should handle posts with different authors', async () => {
      await createStreamWithPosts([]);
      const mockNexusPostsKeyStream: NexusPostsKeyStream = {
        post_keys: ['author-1:post-1', 'author-2:post-2', 'author-1:post-3'],
        last_post_score: BASE_TIMESTAMP + 2,
      };
      vi.spyOn(NexusPostStreamService, 'fetch').mockResolvedValue(mockNexusPostsKeyStream);
      vi.spyOn(PostDetailsModel, 'findByIdsPreserveOrder').mockResolvedValue(Array(3).fill(undefined));

      const result = await PostStreamApplication.getOrFetchStreamSlice({
        streamId,
        limit: 10,
        streamTail: 0,
        streamHead: 0,
        viewerId: DEFAULT_AUTHOR,
      });

      expect(result.nextPageIds).toHaveLength(3);
      expect(result.nextPageIds).toEqual(['author-1:post-1', 'author-2:post-2', 'author-1:post-3']);
    });

    it('should handle when limit is 0', async () => {
      const postIds = Array.from({ length: 5 }, (_, i) => `${DEFAULT_AUTHOR}:post-${i + 1}`);
      await createStreamWithPosts(postIds);
      await createPostDetails(postIds);

      const nexusFetchSpy = vi.spyOn(NexusPostStreamService, 'fetch').mockResolvedValue({
        post_keys: [],
        last_post_score: 0,
      });

      const result = await PostStreamApplication.getOrFetchStreamSlice({
        streamId,
        limit: 0,
        streamHead: 0,
        streamTail: 0,
        viewerId: DEFAULT_AUTHOR,
      });

      expect(result.nextPageIds).toHaveLength(0);
      expect(result.cacheMissPostIds).toEqual([]);
      expect(result.timestamp).toBeUndefined();
      // Note: When limit is 0, getStreamFromCache returns empty immediately and doesn't fetch from Nexus
      expect(nexusFetchSpy).not.toHaveBeenCalled();
    });

    it('should handle when timestamp is provided but post_id is not', async () => {
      await createStreamWithPosts([]);
      const mockNexusPostsKeyStream = createMockNexusPostsKeyStream(5);
      vi.spyOn(NexusPostStreamService, 'fetch').mockResolvedValue(mockNexusPostsKeyStream);
      vi.spyOn(PostDetailsModel, 'findByIdsPreserveOrder').mockResolvedValue(Array(5).fill(undefined));

      const result = await PostStreamApplication.getOrFetchStreamSlice({
        streamId,
        limit: 10,
        streamHead: 0,
        streamTail: BASE_TIMESTAMP,
        viewerId: DEFAULT_AUTHOR,
      });

      expect(result.nextPageIds).toHaveLength(5);
    });

    it('should force streamTail to 0 on initial load with empty cache', async () => {
      await createStreamWithPosts([]);
      const staleStreamTail = BASE_TIMESTAMP + 100;
      const mockNexusPostsKeyStream = createMockNexusPostsKeyStream(5);
      const nexusFetchSpy = vi.spyOn(NexusPostStreamService, 'fetch').mockResolvedValue(mockNexusPostsKeyStream);

      const result = await PostStreamApplication.getOrFetchStreamSlice({
        streamId,
        limit: 10,
        streamHead: 0,
        streamTail: staleStreamTail,
        lastPostId: undefined, // Initial load
        viewerId: DEFAULT_AUTHOR,
      });

      // Should fetch from beginning (streamTail reset to 0)
      expect(nexusFetchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          params: expect.not.objectContaining({
            start: expect.anything(),
          }),
        }),
      );
      expect(result.nextPageIds).toHaveLength(5);
    });

    it('should skip cache check for engagement streams', async () => {
      const engagementStreamId = `${StreamSorting.ENGAGEMENT}:all:all` as PostStreamId;
      const postIds = Array.from({ length: 10 }, (_, i) => `${DEFAULT_AUTHOR}:post-${i + 1}`);
      // Create cache for engagement stream
      await PostStreamModel.create(engagementStreamId, postIds);
      await createPostDetails(postIds);

      const mockNexusPostsKeyStream = createMockNexusPostsKeyStream(5);
      const nexusFetchSpy = vi.spyOn(NexusPostStreamService, 'fetch').mockResolvedValue(mockNexusPostsKeyStream);

      const result = await PostStreamApplication.getOrFetchStreamSlice({
        streamId: engagementStreamId,
        limit: 10,
        streamHead: 0,
        streamTail: 0,
        viewerId: DEFAULT_AUTHOR,
      });

      // Should fetch from Nexus even though cache exists
      expect(nexusFetchSpy).toHaveBeenCalled();
      expect(result.nextPageIds).toHaveLength(5);
      // Should not return cached posts (should return fetched posts from Nexus)
      expectPostIds(result.nextPageIds, 1, 5);
    });

    it('should fallback to Nexus when cachedStream exists but getStreamFromCache returns empty', async () => {
      const postIds = Array.from({ length: 5 }, (_, i) => `${DEFAULT_AUTHOR}:post-${i + 1}`);
      await createStreamWithPosts(postIds);
      await createPostDetails(postIds);

      const mockNexusPostsKeyStream = createMockNexusPostsKeyStream(5, 6, DEFAULT_AUTHOR, BASE_TIMESTAMP + 5);
      const nexusFetchSpy = vi.spyOn(NexusPostStreamService, 'fetch').mockResolvedValue(mockNexusPostsKeyStream);

      // lastPostId not found in cache
      const result = await PostStreamApplication.getOrFetchStreamSlice({
        streamId,
        limit: 10,
        streamHead: 0,
        lastPostId: `${DEFAULT_AUTHOR}:post-999`, // Not in cache
        streamTail: BASE_TIMESTAMP + 999,
        viewerId: DEFAULT_AUTHOR,
      });

      // Should fallback to Nexus fetch
      expect(nexusFetchSpy).toHaveBeenCalled();
      expect(result.nextPageIds).toHaveLength(5);
      expectPostIds(result.nextPageIds, 6, 5);
    });

    it('should deduplicate when fetched posts overlap with cached posts', async () => {
      // Cache has 3 posts: [post-1, post-2, post-3]
      const cachedPostIds = Array.from({ length: 3 }, (_, i) => `${DEFAULT_AUTHOR}:post-${i + 1}`);
      await createStreamWithPosts(cachedPostIds);
      await createPostDetails(cachedPostIds);

      // Nexus returns posts that overlap with cache: [post-3, post-4, post-5]
      // post-3 is already in cache, so it should be deduplicated
      const mockNexusPostsKeyStream: NexusPostsKeyStream = {
        post_keys: [
          `${DEFAULT_AUTHOR}:post-3`, // Overlap with cache
          `${DEFAULT_AUTHOR}:post-4`,
          `${DEFAULT_AUTHOR}:post-5`,
        ],
        last_post_score: BASE_TIMESTAMP + 4,
      };
      vi.spyOn(NexusPostStreamService, 'fetch').mockResolvedValue(mockNexusPostsKeyStream);

      const result = await PostStreamApplication.getOrFetchStreamSlice({
        streamId,
        limit: 5,
        streamTail: 0,
        streamHead: 0,
        viewerId: DEFAULT_AUTHOR,
      });

      // Should have 5 unique posts: [post-1, post-2, post-3, post-4, post-5]
      // post-3 should not be duplicated
      expect(result.nextPageIds).toHaveLength(5);
      expect(result.nextPageIds).toEqual([
        `${DEFAULT_AUTHOR}:post-1`,
        `${DEFAULT_AUTHOR}:post-2`,
        `${DEFAULT_AUTHOR}:post-3`,
        `${DEFAULT_AUTHOR}:post-4`,
        `${DEFAULT_AUTHOR}:post-5`,
      ]);
      // Verify no duplicates
      expect(new Set(result.nextPageIds).size).toBe(5);
    });

    it('should handle error when getting timestamp from last cached post fails', async () => {
      // Cache has 3 posts: [post-1, post-2, post-3]
      const cachedPostIds = Array.from({ length: 3 }, (_, i) => `${DEFAULT_AUTHOR}:post-${i + 1}`);
      await createStreamWithPosts(cachedPostIds);
      await createPostDetails(cachedPostIds);

      // Mock error when getting last post details
      vi.spyOn(PostDetailsModel, 'findById').mockRejectedValueOnce(new Error('Database error'));

      const mockNexusPostsKeyStream = createMockNexusPostsKeyStream(5, 4, DEFAULT_AUTHOR, BASE_TIMESTAMP + 3);
      const nexusFetchSpy = vi.spyOn(NexusPostStreamService, 'fetch').mockResolvedValue(mockNexusPostsKeyStream);

      const result = await PostStreamApplication.getOrFetchStreamSlice({
        streamId,
        limit: 10,
        streamHead: 0,
        streamTail: BASE_TIMESTAMP + 100, // Original streamTail
        viewerId: DEFAULT_AUTHOR,
      });

      // Should still fetch and combine successfully
      // Should use original streamTail when error occurs
      expect(nexusFetchSpy).toHaveBeenCalled();
      expect(result.nextPageIds).toHaveLength(8); // 3 cached + 5 fetched
      // First 3 should be from cache
      expectPostIds(result.nextPageIds.slice(0, 3), 1, 3);
      // Next 5 should be from Nexus
      expectPostIds(result.nextPageIds.slice(3, 8), 4, 5);
    });

    it('should combine cached + fetched posts correctly with proper order and completeness', async () => {
      // Cache has 2 posts: [post-1, post-2]
      const cachedPostIds = Array.from({ length: 2 }, (_, i) => `${DEFAULT_AUTHOR}:post-${i + 1}`);
      await createStreamWithPosts(cachedPostIds);
      await createPostDetails(cachedPostIds);

      // Request 5 posts, cache has 2, so fetch 3 more
      const mockNexusPostsKeyStream = createMockNexusPostsKeyStream(3, 3, DEFAULT_AUTHOR, BASE_TIMESTAMP + 2);
      vi.spyOn(NexusPostStreamService, 'fetch').mockResolvedValue(mockNexusPostsKeyStream);

      const result = await PostStreamApplication.getOrFetchStreamSlice({
        streamId,
        limit: 5,
        streamHead: 0,
        streamTail: 0,
        viewerId: DEFAULT_AUTHOR,
      });

      // Should combine: 2 cached + 3 fetched = 5 total
      expect(result.nextPageIds).toHaveLength(5);
      // Verify order: cached posts first, then fetched posts
      expect(result.nextPageIds).toEqual([
        `${DEFAULT_AUTHOR}:post-1`,
        `${DEFAULT_AUTHOR}:post-2`,
        `${DEFAULT_AUTHOR}:post-3`,
        `${DEFAULT_AUTHOR}:post-4`,
        `${DEFAULT_AUTHOR}:post-5`,
      ]);
      // Verify completeness: all posts are present
      expectPostIds(result.nextPageIds.slice(0, 2), 1, 2); // Cached
      expectPostIds(result.nextPageIds.slice(2, 5), 3, 3); // Fetched
    });

    it('should return empty array when lastPostId is at end of cache', async () => {
      // Cache has 5 posts: [post-1, post-2, post-3, post-4, post-5]
      const postIds = Array.from({ length: 5 }, (_, i) => `${DEFAULT_AUTHOR}:post-${i + 1}`);
      await createStreamWithPosts(postIds);
      await createPostDetails(postIds);

      const mockNexusPostsKeyStream = createMockNexusPostsKeyStream(5, 6, DEFAULT_AUTHOR, BASE_TIMESTAMP + 5);
      const nexusFetchSpy = vi.spyOn(NexusPostStreamService, 'fetch').mockResolvedValue(mockNexusPostsKeyStream);

      // lastPostId is the last post in cache (post-5)
      const result = await PostStreamApplication.getOrFetchStreamSlice({
        streamId,
        limit: 10,
        streamHead: 0,
        lastPostId: `${DEFAULT_AUTHOR}:post-5`, // Last post in cache
        streamTail: BASE_TIMESTAMP + 4,
        viewerId: DEFAULT_AUTHOR,
      });

      // getStreamFromCache should return empty (no posts after lastPostId)
      // Should fallback to Nexus fetch
      expect(nexusFetchSpy).toHaveBeenCalled();
      expect(result.nextPageIds).toHaveLength(5);
      expectPostIds(result.nextPageIds, 6, 5);
    });

    it('should return partial cache when fewer posts than limit (no lastPostId)', async () => {
      // Cache has only 3 posts, but request limit is 10
      const postIds = Array.from({ length: 3 }, (_, i) => `${DEFAULT_AUTHOR}:post-${i + 1}`);
      await createStreamWithPosts(postIds);
      await createPostDetails(postIds);

      const mockNexusPostsKeyStream = createMockNexusPostsKeyStream(7, 4, DEFAULT_AUTHOR, BASE_TIMESTAMP + 3);
      const nexusFetchSpy = vi.spyOn(NexusPostStreamService, 'fetch').mockResolvedValue(mockNexusPostsKeyStream);

      const result = await PostStreamApplication.getOrFetchStreamSlice({
        streamId,
        limit: 10,
        streamHead: 0,
        streamTail: 0,
        viewerId: DEFAULT_AUTHOR,
      });

      // getStreamFromCache should return all 3 cached posts (fewer than limit)
      // Should trigger partial cache hit and fetch remaining 7 from Nexus
      // Result should be 3 cached + 7 fetched = 10 total
      expect(nexusFetchSpy).toHaveBeenCalled();
      expect(result.nextPageIds).toHaveLength(10);
      // First 3 should be from cache
      expectPostIds(result.nextPageIds.slice(0, 3), 1, 3);
      // Next 7 should be from Nexus
      expectPostIds(result.nextPageIds.slice(3, 10), 4, 7);
    });

    it('should fetch original posts for reposts when served from cache (full cache hit)', async () => {
      const repostAuthor = 'reposter-user';
      const originalAuthor = 'original-author';
      const originalPostId = 'original-post-123';
      const originalPostUri = `pubky://${originalAuthor}/pub/pubky.app/posts/${originalPostId}`;
      const originalPostCompositeId = `${originalAuthor}:${originalPostId}`;
      const repostCompositeId = `${repostAuthor}:repost-1`;

      // Create a repost in the stream cache (full cache hit scenario)
      await createStreamWithPosts([repostCompositeId]);

      // Create the repost's details in cache
      await PostDetailsModel.create({
        id: repostCompositeId,
        content: 'This is a repost',
        kind: 'short',
        indexed_at: BASE_TIMESTAMP,
        uri: `pubky://${repostAuthor}/pub/pubky.app/posts/repost-1`,
        attachments: null,
      });

      // Create the repost's relationships in cache (marking it as a repost)
      await PostRelationshipsModel.table.put({
        id: repostCompositeId,
        replied: null,
        reposted: originalPostUri,
        mentioned: [],
      });

      // DO NOT create the original post in cache - this is the bug scenario
      // The original post is missing from cache

      // Mock the Nexus API to return the original post when fetched
      const originalNexusPost = createMockNexusPost(originalPostId, originalAuthor, BASE_TIMESTAMP - 1000);
      const fetchByIdsSpy = vi.spyOn(NexusPostStreamService, 'fetchByIds').mockResolvedValue([originalNexusPost]);

      // Mock other dependencies
      const mocks = setupDefaultMocks();
      mocks.getUserDetails.mockResolvedValue([{ id: originalAuthor } as UserDetailsModelSchema]);

      // Mock that original post is NOT in local DB
      vi.spyOn(LocalStreamPostsService, 'getNotPersistedPostsInCache').mockResolvedValue([originalPostCompositeId]);

      // Call getOrFetchStreamSlice - should return repost from cache (full cache hit)
      const result = await PostStreamApplication.getOrFetchStreamSlice({
        streamId,
        limit: 1,
        streamHead: 0,
        streamTail: 0,
        viewerId: 'viewer-user' as Pubky,
      });

      // Verify we got the repost from cache
      expect(result.nextPageIds).toEqual([repostCompositeId]);
      // This is a full cache hit, so cacheMissPostIds should be empty for the stream posts
      expect(result.cacheMissPostIds).toEqual([]);

      // Verify that the original post is fetched even though cacheMissPostIds is empty
      // (the repost was served from cache, but its original post was missing)
      expect(fetchByIdsSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          post_ids: expect.arrayContaining([originalPostCompositeId]),
        }),
      );
    });
  });

  describe('getCachedLastPostTimestamp', () => {
    it('should return 0 when stream does not exist', async () => {
      const result = await PostStreamApplication.getCachedLastPostTimestamp({ streamId });

      expect(result).toBe(0);
    });

    it('should return 0 when stream is empty', async () => {
      await createStreamWithPosts([]);

      const result = await PostStreamApplication.getCachedLastPostTimestamp({ streamId });

      expect(result).toBe(0);
    });

    it('should return timestamp of last post with details', async () => {
      const postIds = Array.from({ length: 5 }, (_, i) => `${DEFAULT_AUTHOR}:post-${i + 1}`);
      await createStreamWithPosts(postIds);
      await createPostDetails(postIds);

      const result = await PostStreamApplication.getCachedLastPostTimestamp({ streamId });

      // Last post is post-5, which has timestamp BASE_TIMESTAMP + 4
      expect(result).toBe(BASE_TIMESTAMP + 4);
    });

    it('should iterate backwards when last post has no details', async () => {
      const postIds = Array.from({ length: 5 }, (_, i) => `${DEFAULT_AUTHOR}:post-${i + 1}`);
      await createStreamWithPosts(postIds);
      // Only create details for first 3 posts (post-1, post-2, post-3)
      await createPostDetails(postIds.slice(0, 3));

      const result = await PostStreamApplication.getCachedLastPostTimestamp({ streamId });

      // Should find post-3 (3rd from end), which has timestamp BASE_TIMESTAMP + 2
      expect(result).toBe(BASE_TIMESTAMP + 2);
    });

    it('should return 0 when no posts have details', async () => {
      const postIds = Array.from({ length: 5 }, (_, i) => `${DEFAULT_AUTHOR}:post-${i + 1}`);
      await createStreamWithPosts(postIds);
      // Don't create any post details

      const result = await PostStreamApplication.getCachedLastPostTimestamp({ streamId });

      expect(result).toBe(0);
    });

    it('should handle database errors gracefully', async () => {
      const postIds = Array.from({ length: 5 }, (_, i) => `${DEFAULT_AUTHOR}:post-${i + 1}`);
      await createStreamWithPosts(postIds);
      vi.spyOn(PostStreamModel, 'findById').mockRejectedValue(new Error('Database error'));

      const result = await PostStreamApplication.getCachedLastPostTimestamp({ streamId });

      expect(result).toBe(0);
    });
  });

  describe('fetchMissingPostsFromNexus', () => {
    const viewerId = 'user-viewer' as Pubky;

    it('should fetch and persist posts when postBatch exists', async () => {
      const { cacheMissPostIds, mockNexusPosts } = createTestData(2);
      const mocks = setupDefaultMocks();
      mocks.getUserDetails.mockResolvedValue(mockAllUsersCached(2));

      const fetchPostsByIdsSpy = vi.spyOn(NexusPostStreamService, 'fetchByIds').mockResolvedValue(mockNexusPosts);

      await PostStreamApplication.fetchMissingPostsFromNexus({
        cacheMissPostIds,
        viewerId,
      });

      expect(fetchPostsByIdsSpy).toHaveBeenCalledWith({
        post_ids: cacheMissPostIds,
        viewer_id: viewerId,
      });
      expect(mocks.persistPosts).toHaveBeenCalledWith({ posts: mockNexusPosts });
      expect(mocks.persistFiles).toHaveBeenCalledWith([]);
    });

    it('should fetch and persist users when cacheMissUserIds exist', async () => {
      const { cacheMissPostIds, mockNexusPosts } = createTestData(1);
      const mockNexusUsers = [createMockNexusUser(DEFAULT_AUTHOR)];
      const mocks = setupDefaultMocks();
      mocks.getUserDetails.mockResolvedValue([undefined]);

      vi.spyOn(NexusPostStreamService, 'fetchByIds').mockResolvedValue(mockNexusPosts);
      const fetchUsersByIdsSpy = vi.spyOn(NexusUserStreamService, 'fetchByIds').mockResolvedValue(mockNexusUsers);

      const persistUsersSpy = vi.spyOn(LocalStreamUsersService, 'persistUsers').mockResolvedValue([]);

      await PostStreamApplication.fetchMissingPostsFromNexus({
        cacheMissPostIds,
        viewerId,
      });

      expect(fetchUsersByIdsSpy).toHaveBeenCalledWith({
        user_ids: [DEFAULT_AUTHOR],
        viewer_id: viewerId,
      });
      expect(persistUsersSpy).toHaveBeenCalledWith(mockNexusUsers);
    });

    it('should handle when userBatch is null/undefined', async () => {
      const { cacheMissPostIds, mockNexusPosts } = createTestData(1);
      const mocks = setupDefaultMocks();
      mocks.getUserDetails.mockResolvedValue([undefined]);

      vi.spyOn(NexusPostStreamService, 'fetchByIds').mockResolvedValue(mockNexusPosts);
      vi.spyOn(NexusUserStreamService, 'fetchByIds').mockResolvedValue(asInvalid<NexusUser[]>(undefined));

      const persistUsersSpy = vi.spyOn(LocalStreamUsersService, 'persistUsers').mockResolvedValue([]);

      await PostStreamApplication.fetchMissingPostsFromNexus({
        cacheMissPostIds,
        viewerId,
      });

      expect(persistUsersSpy).toHaveBeenCalledWith(undefined);
    });

    it('should not fetch users when all users are already cached', async () => {
      const { cacheMissPostIds, mockNexusPosts } = createTestData(1);
      const mocks = setupDefaultMocks();
      mocks.getUserDetails.mockResolvedValue(mockAllUsersCached(1));

      vi.spyOn(NexusPostStreamService, 'fetchByIds').mockResolvedValue(mockNexusPosts);
      const fetchUsersByIdsSpy = vi.spyOn(NexusUserStreamService, 'fetchByIds');

      await PostStreamApplication.fetchMissingPostsFromNexus({
        cacheMissPostIds,
        viewerId,
      });

      expect(fetchUsersByIdsSpy).not.toHaveBeenCalled();
    });

    it('should handle when cacheMissPostIds is empty array', async () => {
      const cacheMissPostIds: string[] = [];
      const mocks = setupDefaultMocks();

      const fetchPostsByIdsSpy = vi.spyOn(NexusPostStreamService, 'fetchByIds').mockResolvedValue([]);

      await PostStreamApplication.fetchMissingPostsFromNexus({
        cacheMissPostIds,
        viewerId,
      });

      expect(fetchPostsByIdsSpy).toHaveBeenCalledWith({
        post_ids: [],
        viewer_id: viewerId,
      });
      expect(mocks.persistPosts).toHaveBeenCalledWith({ posts: [] });
    });

    it('should handle when postBatch is empty array', async () => {
      const { cacheMissPostIds } = createTestData(1);
      const mocks = setupDefaultMocks();

      vi.spyOn(NexusPostStreamService, 'fetchByIds').mockResolvedValue([]);

      await PostStreamApplication.fetchMissingPostsFromNexus({
        cacheMissPostIds,
        viewerId,
      });

      expect(mocks.persistPosts).toHaveBeenCalledWith({ posts: [] });
    });

    it('should handle when userBatch is empty array', async () => {
      const { cacheMissPostIds, mockNexusPosts } = createTestData(1);
      const mocks = setupDefaultMocks();
      mocks.getUserDetails.mockResolvedValue([undefined]);

      vi.spyOn(NexusPostStreamService, 'fetchByIds').mockResolvedValue(mockNexusPosts);
      vi.spyOn(NexusUserStreamService, 'fetchByIds').mockResolvedValue([]);

      const persistUsersSpy = vi.spyOn(LocalStreamUsersService, 'persistUsers');

      await PostStreamApplication.fetchMissingPostsFromNexus({
        cacheMissPostIds,
        viewerId,
      });

      expect(persistUsersSpy).toHaveBeenCalledWith([]);
    });

    it('should handle error gracefully when NexusPostStreamService.fetchByIds fails', async () => {
      const { cacheMissPostIds } = createTestData(1);
      const fetchPostsByIdsSpy = vi
        .spyOn(NexusPostStreamService, 'fetchByIds')
        .mockRejectedValue(new Error('Network error'));

      await PostStreamApplication.fetchMissingPostsFromNexus({
        cacheMissPostIds,
        viewerId,
      });

      expect(fetchPostsByIdsSpy).toHaveBeenCalled();
    });

    it('should handle error gracefully when persistPosts fails', async () => {
      const { cacheMissPostIds, mockNexusPosts } = createTestData(1);
      vi.spyOn(NexusPostStreamService, 'fetchByIds').mockResolvedValue(mockNexusPosts);
      vi.spyOn(LocalStreamPostsService, 'persistPosts').mockRejectedValue(new Error('Failed to persist posts'));

      await PostStreamApplication.fetchMissingPostsFromNexus({
        cacheMissPostIds,
        viewerId,
      });

      expect(LocalStreamPostsService.persistPosts).toHaveBeenCalled();
    });

    it('should handle error gracefully when file persistence fails', async () => {
      const { cacheMissPostIds, mockNexusPosts } = createTestData(1);
      const mockAttachments: NexusFileDetails[] = [
        {
          id: 'file-1',
          name: 'file-1',
          src: '',
          content_type: 'image/png',
          size: 100,
          created_at: 0,
          indexed_at: 0,
          metadata: {},
          owner_id: 'user-1',
          uri: 'pubky://user-1/pub/pubky.app/files/file-1',
          urls: {} as NexusFileUrls,
        },
        {
          id: 'file-2',
          name: 'file-2',
          src: '',
          content_type: 'image/png',
          size: 200,
          created_at: 0,
          indexed_at: 0,
          metadata: {},
          owner_id: 'user-1',
          uri: 'pubky://user-1/pub/pubky.app/files/file-2',
          urls: {} as NexusFileUrls,
        },
      ];

      const fetchPostsByIdsSpy = vi.spyOn(NexusPostStreamService, 'fetchByIds').mockResolvedValue(mockNexusPosts);
      vi.spyOn(LocalStreamPostsService, 'persistPosts').mockResolvedValue({
        attachmentMetadata: mockAttachments,
      });
      const persistFilesSpy = vi
        .spyOn(FileApplication, 'persistFiles')
        .mockRejectedValue(new Error('Failed to persist files'));

      const getUserDetailsSpy = vi.spyOn(UserDetailsModel, 'findByIdsPreserveOrder');
      const persistUsersSpy = vi.spyOn(LocalStreamUsersService, 'persistUsers');

      await PostStreamApplication.fetchMissingPostsFromNexus({
        cacheMissPostIds,
        viewerId,
      });

      expect(persistFilesSpy).toHaveBeenCalledWith(mockAttachments);
      expect(fetchPostsByIdsSpy).toHaveBeenCalledTimes(1);
      expect(getUserDetailsSpy).not.toHaveBeenCalled();
      expect(persistUsersSpy).not.toHaveBeenCalled();
    });

    it('should handle error gracefully when NexusUserStreamService.fetchByIds fails', async () => {
      const { cacheMissPostIds, mockNexusPosts } = createTestData(1);
      const mocks = setupDefaultMocks();
      mocks.getUserDetails.mockResolvedValue([undefined]);

      vi.spyOn(NexusPostStreamService, 'fetchByIds').mockResolvedValue(mockNexusPosts);
      const fetchUsersByIdsSpy = vi
        .spyOn(NexusUserStreamService, 'fetchByIds')
        .mockRejectedValue(new Error('Network error fetching users'));

      await PostStreamApplication.fetchMissingPostsFromNexus({
        cacheMissPostIds,
        viewerId,
      });

      expect(fetchUsersByIdsSpy).toHaveBeenCalled();
    });

    it('should handle error gracefully when persistUsers fails', async () => {
      const { cacheMissPostIds, mockNexusPosts } = createTestData(1);
      const mockNexusUsers = [createMockNexusUser(DEFAULT_AUTHOR)];
      const mocks = setupDefaultMocks();
      mocks.getUserDetails.mockResolvedValue([undefined]);

      vi.spyOn(NexusPostStreamService, 'fetchByIds').mockResolvedValue(mockNexusPosts);
      vi.spyOn(NexusUserStreamService, 'fetchByIds').mockResolvedValue(mockNexusUsers);

      vi.spyOn(LocalStreamUsersService, 'persistUsers').mockRejectedValue(new Error('Failed to persist users'));

      await PostStreamApplication.fetchMissingPostsFromNexus({
        cacheMissPostIds,
        viewerId,
      });

      expect(LocalStreamUsersService.persistUsers).toHaveBeenCalled();
    });

    it('should handle multiple posts with same author', async () => {
      const { cacheMissPostIds, mockNexusPosts } = createTestData(2);
      const mocks = setupDefaultMocks();
      mocks.getUserDetails.mockResolvedValue(mockAllUsersCached(2));

      const fetchPostsByIdsSpy = vi.spyOn(NexusPostStreamService, 'fetchByIds').mockResolvedValue(mockNexusPosts);
      const fetchUsersByIdsSpy = vi.spyOn(NexusUserStreamService, 'fetchByIds');
      const persistUsersSpy = vi.spyOn(LocalStreamUsersService, 'persistUsers');

      await PostStreamApplication.fetchMissingPostsFromNexus({
        cacheMissPostIds,
        viewerId,
      });

      expect(fetchPostsByIdsSpy).toHaveBeenCalledTimes(1);
      expect(fetchUsersByIdsSpy).not.toHaveBeenCalled();
      expect(persistUsersSpy).not.toHaveBeenCalled();
    });

    it('should handle posts with different authors', async () => {
      const cacheMissPostIds = [`author-1:post-1`, `author-2:post-2`];
      const mockNexusPosts: NexusPost[] = [
        createMockNexusPost('post-1', 'author-1', BASE_TIMESTAMP),
        createMockNexusPost('post-2', 'author-2', BASE_TIMESTAMP + 1),
      ];
      const mockNexusUsers = [createMockNexusUser('author-1'), createMockNexusUser('author-2')];
      const mocks = setupDefaultMocks();
      mocks.getUserDetails.mockResolvedValue([undefined, undefined]);

      vi.spyOn(NexusPostStreamService, 'fetchByIds').mockResolvedValue(mockNexusPosts);
      const fetchUsersByIdsSpy = vi.spyOn(NexusUserStreamService, 'fetchByIds').mockResolvedValue(mockNexusUsers);

      const persistUsersSpy = vi.spyOn(LocalStreamUsersService, 'persistUsers').mockResolvedValue([]);

      await PostStreamApplication.fetchMissingPostsFromNexus({
        cacheMissPostIds,
        viewerId,
      });

      expect(fetchUsersByIdsSpy).toHaveBeenCalled();
      expect(persistUsersSpy).toHaveBeenCalledWith(mockNexusUsers);
    });

    it('should handle when getNotPersistedUsersInCache returns partial users', async () => {
      const cacheMissPostIds = [`author-1:post-1`, `author-2:post-2`];
      const mockNexusPosts: NexusPost[] = [
        createMockNexusPost('post-1', 'author-1', BASE_TIMESTAMP),
        createMockNexusPost('post-2', 'author-2', BASE_TIMESTAMP + 1),
      ];
      const mockNexusUsers = [createMockNexusUser('author-2')];
      const mocks = setupDefaultMocks();
      mocks.getUserDetails.mockResolvedValue([{ id: 'author-1' } as UserDetailsModelSchema, undefined]);

      vi.spyOn(NexusPostStreamService, 'fetchByIds').mockResolvedValue(mockNexusPosts);
      const fetchUsersByIdsSpy = vi.spyOn(NexusUserStreamService, 'fetchByIds').mockResolvedValue(mockNexusUsers);

      const persistUsersSpy = vi.spyOn(LocalStreamUsersService, 'persistUsers').mockResolvedValue([]);

      await PostStreamApplication.fetchMissingPostsFromNexus({
        cacheMissPostIds,
        viewerId,
      });

      expect(fetchUsersByIdsSpy).toHaveBeenCalledWith({
        user_ids: ['author-2'],
        viewer_id: viewerId,
      });
      expect(persistUsersSpy).toHaveBeenCalledWith(mockNexusUsers);
    });

    it('should handle error gracefully when getNotPersistedUsersInCache fails', async () => {
      const { cacheMissPostIds, mockNexusPosts } = createTestData(1);
      setupDefaultMocks();

      vi.spyOn(NexusPostStreamService, 'fetchByIds').mockResolvedValue(mockNexusPosts);
      vi.spyOn(UserDetailsModel, 'findByIdsPreserveOrder').mockRejectedValue(new Error('Database query failed'));

      await PostStreamApplication.fetchMissingPostsFromNexus({
        cacheMissPostIds,
        viewerId,
      });

      expect(UserDetailsModel.findByIdsPreserveOrder).toHaveBeenCalled();
    });

    it('should fetch original posts for reposts', async () => {
      const repostAuthor = 'reposter-user';
      const originalAuthor = 'original-author';
      const originalPostUri = `pubky://${originalAuthor}/pub/pubky.app/posts/original-post`;
      const originalPostCompositeId = `${originalAuthor}:original-post`;

      // Create a repost that references an original post
      const repostNexusPost = createMockNexusPost('repost-1', repostAuthor, BASE_TIMESTAMP, {
        relationships: {
          replied: null,
          reposted: originalPostUri,
          mentioned: [],
        },
      });

      // Original post that will be fetched
      const originalNexusPost = createMockNexusPost('original-post', originalAuthor, BASE_TIMESTAMP - 1000);

      const mocks = setupDefaultMocks();
      mocks.getUserDetails.mockResolvedValue([{ id: repostAuthor } as UserDetailsModelSchema]);

      // Mock post fetching service
      const fetchPostsByIdsSpy = vi
        .spyOn(NexusPostStreamService, 'fetchByIds')
        .mockResolvedValueOnce([repostNexusPost]) // fetchMissingPostsFromNexus: posts
        .mockResolvedValueOnce([originalNexusPost]); // fetchOriginalPostsByUris: original posts

      // Mock user fetching service for original post's author
      vi.spyOn(NexusUserStreamService, 'fetchByIds').mockResolvedValue([createMockNexusUser(originalAuthor)]);

      // Mock that original post is NOT in cache (needs to be fetched)
      vi.spyOn(LocalStreamPostsService, 'getNotPersistedPostsInCache').mockResolvedValueOnce([originalPostCompositeId]);

      await PostStreamApplication.fetchMissingPostsFromNexus({
        cacheMissPostIds: [`${repostAuthor}:repost-1`],
        viewerId,
      });

      // Should have called fetchByIds to fetch original post
      expect(fetchPostsByIdsSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          post_ids: expect.arrayContaining([originalPostCompositeId]),
        }),
      );
    });

    it('should not fetch original posts when they are already in local DB', async () => {
      const repostAuthor = 'reposter-user';
      const originalAuthor = 'original-author';
      const originalPostUri = `pubky://${originalAuthor}/pub/pubky.app/posts/original-post`;

      // Create a repost that references an original post
      const repostNexusPost = createMockNexusPost('repost-1', repostAuthor, BASE_TIMESTAMP, {
        relationships: {
          replied: null,
          reposted: originalPostUri,
          mentioned: [],
        },
      });

      const mocks = setupDefaultMocks();
      mocks.getUserDetails.mockResolvedValue([{ id: repostAuthor } as UserDetailsModelSchema]);

      const fetchPostsByIdsSpy = vi
        .spyOn(NexusPostStreamService, 'fetchByIds')
        .mockResolvedValueOnce([repostNexusPost]);

      // Mock that original post IS in cache (no need to fetch)
      vi.spyOn(LocalStreamPostsService, 'getNotPersistedPostsInCache').mockResolvedValueOnce([]);

      await PostStreamApplication.fetchMissingPostsFromNexus({
        cacheMissPostIds: [`${repostAuthor}:repost-1`],
        viewerId,
      });

      // Should only have called fetchByIds once (for the repost, not for original)
      expect(fetchPostsByIdsSpy).toHaveBeenCalledTimes(1);
    });

    it('should not fetch original posts when there are no reposts', async () => {
      const { cacheMissPostIds, mockNexusPosts } = createTestData(2);

      const mocks = setupDefaultMocks();
      mocks.getUserDetails.mockResolvedValue(mockAllUsersCached(2));

      const fetchPostsByIdsSpy = vi.spyOn(NexusPostStreamService, 'fetchByIds').mockResolvedValueOnce(mockNexusPosts);

      await PostStreamApplication.fetchMissingPostsFromNexus({
        cacheMissPostIds,
        viewerId,
      });

      // Should only have called fetchByIds once (for the posts, not for any originals)
      expect(fetchPostsByIdsSpy).toHaveBeenCalledTimes(1);
    });

    it('should handle error gracefully when fetching original posts fails', async () => {
      const repostAuthor = 'reposter-user';
      const originalAuthor = 'original-author';
      const originalPostUri = `pubky://${originalAuthor}/pub/pubky.app/posts/original-post`;
      const originalPostCompositeId = `${originalAuthor}:original-post`;

      const repostNexusPost = createMockNexusPost('repost-1', repostAuthor, BASE_TIMESTAMP, {
        relationships: {
          replied: null,
          reposted: originalPostUri,
          mentioned: [],
        },
      });

      const mocks = setupDefaultMocks();
      mocks.getUserDetails.mockResolvedValue([{ id: repostAuthor } as UserDetailsModelSchema]);

      vi.spyOn(NexusPostStreamService, 'fetchByIds')
        .mockResolvedValueOnce([repostNexusPost]) // fetchMissingPostsFromNexus: posts
        .mockRejectedValueOnce(new Error('Failed to fetch original posts')); // fetchOriginalPostsByUris fails

      vi.spyOn(LocalStreamPostsService, 'getNotPersistedPostsInCache').mockResolvedValueOnce([originalPostCompositeId]);

      // Should not throw - error should be handled gracefully
      await expect(
        PostStreamApplication.fetchMissingPostsFromNexus({
          cacheMissPostIds: [`${repostAuthor}:repost-1`],
          viewerId,
        }),
      ).resolves.not.toThrow();
    });

    it('should handle multiple reposts with different original posts', async () => {
      const repostAuthor = 'reposter-user';
      const originalAuthor1 = 'original-author-1';
      const originalAuthor2 = 'original-author-2';
      const originalPostUri1 = `pubky://${originalAuthor1}/pub/pubky.app/posts/original-1`;
      const originalPostUri2 = `pubky://${originalAuthor2}/pub/pubky.app/posts/original-2`;

      const repostNexusPosts = [
        createMockNexusPost('repost-1', repostAuthor, BASE_TIMESTAMP, {
          relationships: { replied: null, reposted: originalPostUri1, mentioned: [] },
        }),
        createMockNexusPost('repost-2', repostAuthor, BASE_TIMESTAMP + 1, {
          relationships: { replied: null, reposted: originalPostUri2, mentioned: [] },
        }),
      ];

      const originalNexusPosts = [
        createMockNexusPost('original-1', originalAuthor1, BASE_TIMESTAMP - 1000),
        createMockNexusPost('original-2', originalAuthor2, BASE_TIMESTAMP - 2000),
      ];

      const mocks = setupDefaultMocks();
      mocks.getUserDetails.mockResolvedValue([{ id: repostAuthor } as UserDetailsModelSchema]);

      const fetchPostsByIdsSpy = vi
        .spyOn(NexusPostStreamService, 'fetchByIds')
        .mockResolvedValueOnce(repostNexusPosts)
        .mockResolvedValueOnce(originalNexusPosts);

      vi.spyOn(NexusUserStreamService, 'fetchByIds').mockResolvedValue([
        createMockNexusUser(originalAuthor1),
        createMockNexusUser(originalAuthor2),
      ]);

      vi.spyOn(LocalStreamPostsService, 'getNotPersistedPostsInCache').mockResolvedValueOnce([
        `${originalAuthor1}:original-1`,
        `${originalAuthor2}:original-2`,
      ]);

      await PostStreamApplication.fetchMissingPostsFromNexus({
        cacheMissPostIds: [`${repostAuthor}:repost-1`, `${repostAuthor}:repost-2`],
        viewerId,
      });

      // Should have fetched both original posts
      expect(fetchPostsByIdsSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          post_ids: expect.arrayContaining([`${originalAuthor1}:original-1`, `${originalAuthor2}:original-2`]),
        }),
      );
    });
  });

  describe('getStreamHead', () => {
    it('should return stream head timestamp when stream exists with posts', async () => {
      const postIds = Array.from({ length: 5 }, (_, i) => `${DEFAULT_AUTHOR}:post-${i + 1}`);
      await createStreamWithPosts(postIds);
      await createPostDetails(postIds);

      const result = await PostStreamApplication.getStreamHead({ streamId });

      // Should return the timestamp of the first post (head of stream)
      expect(result).toBe(BASE_TIMESTAMP);
    });

    it('should return stream head timestamp from unread stream when it exists', async () => {
      const unreadPostIds = Array.from({ length: 2 }, (_, i) => `${DEFAULT_AUTHOR}:unread-${i + 1}`);
      const postIds = Array.from({ length: 5 }, (_, i) => `${DEFAULT_AUTHOR}:post-${i + 1}`);

      // Create unread stream (should take precedence)
      await UnreadPostStreamModel.create(streamId, unreadPostIds);
      await createPostDetails(unreadPostIds);

      // Create post stream
      await createStreamWithPosts(postIds);
      await createPostDetails(postIds);

      const result = await PostStreamApplication.getStreamHead({ streamId });

      // Should return timestamp from unread stream head (first unread post)
      expect(result).toBe(BASE_TIMESTAMP);
    });

    it('should return FORCE_FETCH_NEW_POSTS when stream does not exist', async () => {
      const result = await PostStreamApplication.getStreamHead({ streamId });

      expect(result).toBe(FORCE_FETCH_NEW_POSTS);
    });

    it('should return SKIP_FETCH_NEW_POSTS when stream exists but head post has no details', async () => {
      const postIds = Array.from({ length: 5 }, (_, i) => `${DEFAULT_AUTHOR}:post-${i + 1}`);
      await createStreamWithPosts(postIds);
      // Don't create post details

      const result = await PostStreamApplication.getStreamHead({ streamId });

      expect(result).toBe(SKIP_FETCH_NEW_POSTS);
    });

    it('should handle errors from underlying service gracefully', async () => {
      const getStreamHeadSpy = vi
        .spyOn(LocalStreamPostsService, 'getStreamHead')
        .mockRejectedValue(new Error('Database error'));

      await expect(PostStreamApplication.getStreamHead({ streamId })).rejects.toThrow('Database error');

      expect(getStreamHeadSpy).toHaveBeenCalledWith({ streamId });
    });

    it('should pass streamId parameter correctly to underlying service', async () => {
      const customStreamId = PostStreamTypes.TIMELINE_FOLLOWING_ALL as PostStreamId;
      const expectedTimestamp = BASE_TIMESTAMP + 50;

      const getStreamHeadSpy = vi.spyOn(LocalStreamPostsService, 'getStreamHead').mockResolvedValue(expectedTimestamp);

      const result = await PostStreamApplication.getStreamHead({ streamId: customStreamId });

      expect(getStreamHeadSpy).toHaveBeenCalledWith({ streamId: customStreamId });
      expect(result).toBe(expectedTimestamp);
    });
  });

  describe('prepareStreamForInitialLoad', () => {
    it('should clear pagination queue before preparing the stream', async () => {
      const removeSpy = vi.spyOn(postStreamQueue, 'remove');

      await PostStreamApplication.prepareStreamForInitialLoad({ streamId });

      expect(removeSpy).toHaveBeenCalledWith(streamId);
    });

    it('should clear both streams when main stream cache is stale', async () => {
      const now = BASE_TIMESTAMP + STREAM_CACHE_MAX_AGE_MS + 10;
      const staleTimestamp = now - STREAM_CACHE_MAX_AGE_MS - 1;
      vi.spyOn(Date, 'now').mockReturnValue(now);

      const mainPostId = `${DEFAULT_AUTHOR}:post-main`;
      await createStreamWithPosts([mainPostId]);
      await createPostDetailWithTimestamp(mainPostId, staleTimestamp);

      const unreadPostId = `${DEFAULT_AUTHOR}:unread-1`;
      await UnreadPostStreamModel.create(streamId, [unreadPostId]);

      await PostStreamApplication.prepareStreamForInitialLoad({ streamId });

      const postStream = await PostStreamModel.findById(streamId);
      const unreadStream = await UnreadPostStreamModel.findById(streamId);
      expect(postStream).toBeNull();
      expect(unreadStream).toBeNull();
    });

    it('should clear unread stream when unread cache is stale and main is fresh', async () => {
      const now = BASE_TIMESTAMP + STREAM_CACHE_MAX_AGE_MS + 10;
      const freshTimestamp = now - STREAM_CACHE_MAX_AGE_MS + 1;
      const staleTimestamp = now - STREAM_CACHE_MAX_AGE_MS - 1;
      vi.spyOn(Date, 'now').mockReturnValue(now);

      const mainPostId = `${DEFAULT_AUTHOR}:post-main`;
      await createStreamWithPosts([mainPostId]);
      await createPostDetailWithTimestamp(mainPostId, freshTimestamp);

      const unreadPostId = `${DEFAULT_AUTHOR}:unread-1`;
      await UnreadPostStreamModel.create(streamId, [unreadPostId]);
      await createPostDetailWithTimestamp(unreadPostId, staleTimestamp);

      await PostStreamApplication.prepareStreamForInitialLoad({ streamId });

      const postStream = await PostStreamModel.findById(streamId);
      const unreadStream = await UnreadPostStreamModel.findById(streamId);
      expect(postStream?.stream).toEqual([mainPostId]);
      expect(unreadStream).toBeNull();
    });

    it('should merge unread into main and clear unread when both streams are fresh', async () => {
      const now = BASE_TIMESTAMP + STREAM_CACHE_MAX_AGE_MS + 10;
      vi.spyOn(Date, 'now').mockReturnValue(now);

      const mainPostIds = [`${DEFAULT_AUTHOR}:post-1`, `${DEFAULT_AUTHOR}:post-2`];
      const unreadPostIds = [`${DEFAULT_AUTHOR}:unread-1`, `${DEFAULT_AUTHOR}:unread-2`];
      await createStreamWithPosts(mainPostIds);
      await UnreadPostStreamModel.create(streamId, unreadPostIds);

      const mainHeadTimestamp = now - STREAM_CACHE_MAX_AGE_MS + 2;
      const mainOlderTimestamp = now - STREAM_CACHE_MAX_AGE_MS + 1;
      const unreadNewestTimestamp = now - STREAM_CACHE_MAX_AGE_MS + 4;
      const unreadOlderTimestamp = now - STREAM_CACHE_MAX_AGE_MS + 3;

      await createPostDetailWithTimestamp(mainPostIds[0], mainHeadTimestamp);
      await createPostDetailWithTimestamp(mainPostIds[1], mainOlderTimestamp);
      await createPostDetailWithTimestamp(unreadPostIds[0], unreadNewestTimestamp);
      await createPostDetailWithTimestamp(unreadPostIds[1], unreadOlderTimestamp);

      await PostStreamApplication.prepareStreamForInitialLoad({ streamId });

      const postStream = await PostStreamModel.findById(streamId);
      const unreadStream = await UnreadPostStreamModel.findById(streamId);
      expect(postStream?.stream).toEqual([unreadPostIds[0], unreadPostIds[1], mainPostIds[0], mainPostIds[1]]);
      expect(unreadStream).toBeNull();
    });
  });

  describe('mergeUnreadStreamWithPostStream', () => {
    it('should merge unread stream with post stream when both exist', async () => {
      const unreadPostIds = Array.from({ length: 3 }, (_, i) => `${DEFAULT_AUTHOR}:unread-${i + 1}`);
      const postIds = Array.from({ length: 5 }, (_, i) => `${DEFAULT_AUTHOR}:post-${i + 1}`);

      // Create unread stream
      await UnreadPostStreamModel.create(streamId, unreadPostIds);
      // Create post stream
      await createStreamWithPosts(postIds);

      await PostStreamApplication.mergeUnreadStreamWithPostStream({ streamId });

      // Verify the streams were merged: unread posts first, then post stream
      const mergedStream = await PostStreamModel.findById(streamId);
      expect(mergedStream).toBeTruthy();
      expect(mergedStream!.stream).toEqual([...unreadPostIds, ...postIds]);
    });

    it('should handle when unread stream does not exist (no-op)', async () => {
      const postIds = Array.from({ length: 5 }, (_, i) => `${DEFAULT_AUTHOR}:post-${i + 1}`);
      await createStreamWithPosts(postIds);

      // Should not throw and should not modify post stream
      await PostStreamApplication.mergeUnreadStreamWithPostStream({ streamId });

      const postStream = await PostStreamModel.findById(streamId);
      expect(postStream).toBeTruthy();
      expect(postStream!.stream).toEqual(postIds);
    });

    it('should handle when post stream does not exist (no-op)', async () => {
      const unreadPostIds = Array.from({ length: 3 }, (_, i) => `${DEFAULT_AUTHOR}:unread-${i + 1}`);
      await UnreadPostStreamModel.create(streamId, unreadPostIds);

      // Should not throw and should not create post stream
      await PostStreamApplication.mergeUnreadStreamWithPostStream({ streamId });

      const postStream = await PostStreamModel.findById(streamId);
      expect(postStream).toBeNull();
    });

    it('should handle when both streams do not exist (no-op)', async () => {
      // Should not throw
      await PostStreamApplication.mergeUnreadStreamWithPostStream({ streamId });

      const postStream = await PostStreamModel.findById(streamId);
      expect(postStream).toBeNull();
    });

    it('should handle errors from underlying service', async () => {
      const mergeSpy = vi
        .spyOn(LocalStreamPostsService, 'mergeUnreadStreamWithPostStream')
        .mockRejectedValue(new Error('Database error'));

      await expect(PostStreamApplication.mergeUnreadStreamWithPostStream({ streamId })).rejects.toThrow(
        'Database error',
      );

      expect(mergeSpy).toHaveBeenCalledWith({ streamId });
    });

    it('should pass streamId parameter correctly to underlying service', async () => {
      const customStreamId = PostStreamTypes.TIMELINE_FOLLOWING_ALL as PostStreamId;

      const mergeSpy = vi.spyOn(LocalStreamPostsService, 'mergeUnreadStreamWithPostStream').mockResolvedValue();

      await PostStreamApplication.mergeUnreadStreamWithPostStream({ streamId: customStreamId });

      expect(mergeSpy).toHaveBeenCalledWith({ streamId: customStreamId });
    });
  });

  describe('getUnreadStream', () => {
    it('should return unread stream when it exists', async () => {
      const unreadPostIds = Array.from({ length: 3 }, (_, i) => `${DEFAULT_AUTHOR}:unread-${i + 1}`);
      await UnreadPostStreamModel.create(streamId, unreadPostIds);

      const result = await PostStreamApplication.getUnreadStream({ streamId });

      expect(result).toBeTruthy();
      expect(result!.stream).toEqual(unreadPostIds);
    });

    it('should return null when unread stream does not exist', async () => {
      const result = await PostStreamApplication.getUnreadStream({ streamId });

      expect(result).toBeNull();
    });

    it('should handle errors from underlying service', async () => {
      const readUnreadStreamSpy = vi
        .spyOn(LocalStreamPostsService, 'readUnreadStream')
        .mockRejectedValue(new Error('Database error'));

      await expect(PostStreamApplication.getUnreadStream({ streamId })).rejects.toThrow('Database error');

      expect(readUnreadStreamSpy).toHaveBeenCalledWith({ streamId });
    });

    it('should pass streamId parameter correctly to underlying service', async () => {
      const customStreamId = PostStreamTypes.TIMELINE_FOLLOWING_ALL as PostStreamId;
      const mockUnreadStream = { stream: ['post-1', 'post-2'] };

      const readUnreadStreamSpy = vi
        .spyOn(LocalStreamPostsService, 'readUnreadStream')
        .mockResolvedValue(mockUnreadStream);

      const result = await PostStreamApplication.getUnreadStream({ streamId: customStreamId });

      expect(readUnreadStreamSpy).toHaveBeenCalledWith({ streamId: customStreamId });
      expect(result).toEqual(mockUnreadStream);
    });
  });

  describe('getLocalStream', () => {
    it('should return local stream when it exists', async () => {
      const postIds = Array.from({ length: 5 }, (_, i) => `${DEFAULT_AUTHOR}:post-${i + 1}`);
      await createStreamWithPosts(postIds);

      const result = await PostStreamApplication.getLocalStream({ streamId });

      expect(result).toBeTruthy();
      expect(result!.stream).toEqual(postIds);
    });

    it('should return null when stream does not exist', async () => {
      const result = await PostStreamApplication.getLocalStream({ streamId });

      expect(result).toBeNull();
    });

    it('should handle errors from underlying service', async () => {
      const getLocalStreamSpy = vi
        .spyOn(LocalStreamPostsService, 'read')
        .mockRejectedValue(new Error('Database error'));

      await expect(PostStreamApplication.getLocalStream({ streamId })).rejects.toThrow('Database error');

      expect(getLocalStreamSpy).toHaveBeenCalledWith({ streamId });
    });

    it('should pass streamId parameter correctly to underlying service', async () => {
      const customStreamId = PostStreamTypes.TIMELINE_FOLLOWING_ALL as PostStreamId;
      const mockStream = { stream: ['post-1', 'post-2'] };

      const getLocalStreamSpy = vi.spyOn(LocalStreamPostsService, 'read').mockResolvedValue(mockStream);

      const result = await PostStreamApplication.getLocalStream({ streamId: customStreamId });

      expect(getLocalStreamSpy).toHaveBeenCalledWith({ streamId: customStreamId });
      expect(result).toEqual(mockStream);
    });
  });

  describe('clearUnreadStream', () => {
    it('should clear unread stream and return post IDs', async () => {
      const unreadPostIds = Array.from({ length: 3 }, (_, i) => `${DEFAULT_AUTHOR}:unread-${i + 1}`);
      await UnreadPostStreamModel.create(streamId, unreadPostIds);

      const result = await PostStreamApplication.clearUnreadStream({ streamId });

      expect(result).toEqual(unreadPostIds);
      const clearedStream = await UnreadPostStreamModel.findById(streamId);
      expect(clearedStream).toBeNull();
    });

    it('should return empty array when unread stream does not exist', async () => {
      const result = await PostStreamApplication.clearUnreadStream({ streamId });

      expect(result).toEqual([]);
    });

    it('should handle errors from underlying service', async () => {
      const clearUnreadStreamSpy = vi
        .spyOn(LocalStreamPostsService, 'clearUnreadStream')
        .mockRejectedValue(new Error('Database error'));

      await expect(PostStreamApplication.clearUnreadStream({ streamId })).rejects.toThrow('Database error');

      expect(clearUnreadStreamSpy).toHaveBeenCalledWith({ streamId });
    });

    it('should pass streamId parameter correctly to underlying service', async () => {
      const customStreamId = PostStreamTypes.TIMELINE_FOLLOWING_ALL as PostStreamId;
      const mockPostIds = ['post-1', 'post-2'];

      const clearUnreadStreamSpy = vi
        .spyOn(LocalStreamPostsService, 'clearUnreadStream')
        .mockResolvedValue(mockPostIds);

      const result = await PostStreamApplication.clearUnreadStream({ streamId: customStreamId });

      expect(clearUnreadStreamSpy).toHaveBeenCalledWith({ streamId: customStreamId });
      expect(result).toEqual(mockPostIds);
    });
  });

  // ============================================================================
  // Mute Filtering Tests
  // ============================================================================

  describe('filterMutedPosts', () => {
    it('should return all posts when no muted users', () => {
      const postIds = ['author-1:post-1', 'author-2:post-2', 'author-3:post-3'];
      const mutedUserIds = new Set<Pubky>();

      const result = MuteFilter.filterPosts(postIds, mutedUserIds);

      expect(result).toEqual(postIds);
    });

    it('should filter out posts from muted users', () => {
      const postIds = ['author-1:post-1', 'author-2:post-2', 'author-3:post-3'];
      const mutedUserIds = new Set(['author-2'] as Pubky[]);

      const result = MuteFilter.filterPosts(postIds, mutedUserIds);

      expect(result).toEqual(['author-1:post-1', 'author-3:post-3']);
    });

    it('should filter out all posts when all authors are muted', () => {
      const postIds = ['author-1:post-1', 'author-1:post-2', 'author-1:post-3'];
      const mutedUserIds = new Set(['author-1'] as Pubky[]);

      const result = MuteFilter.filterPosts(postIds, mutedUserIds);

      expect(result).toEqual([]);
    });

    it('should handle multiple muted users', () => {
      const postIds = ['author-1:post-1', 'author-2:post-2', 'author-3:post-3', 'author-4:post-4', 'author-2:post-5'];
      const mutedUserIds = new Set(['author-2', 'author-4'] as Pubky[]);

      const result = MuteFilter.filterPosts(postIds, mutedUserIds);

      expect(result).toEqual(['author-1:post-1', 'author-3:post-3']);
    });

    it('should return empty array when input is empty', () => {
      const postIds: string[] = [];
      const mutedUserIds = new Set(['author-1'] as Pubky[]);

      const result = MuteFilter.filterPosts(postIds, mutedUserIds);

      expect(result).toEqual([]);
    });
  });

  describe('getOrFetchStreamSlice with mute filtering', () => {
    const viewerId = 'viewer-user' as Pubky;

    const setupMutedUsers = async (mutedUsers: Pubky[]) => {
      // @ts-expect-error - BaseStreamModel generic type constraint
      await UserStreamModel.upsert(UserStreamTypes.MUTED, mutedUsers);
    };

    it('should filter out posts from muted users', async () => {
      // Mute author-2
      await setupMutedUsers(['author-2'] as Pubky[]);

      // Mock Nexus to return posts from different authors
      const mockNexusPostsKeyStream: NexusPostsKeyStream = {
        post_keys: ['author-1:post-1', 'author-2:post-2', 'author-3:post-3'],
        last_post_score: BASE_TIMESTAMP + 2,
      };
      vi.spyOn(NexusPostStreamService, 'fetch').mockResolvedValue(mockNexusPostsKeyStream);

      const result = await PostStreamApplication.getOrFetchStreamSlice({
        streamId,
        limit: 10,
        streamHead: 0,
        streamTail: 0,
        viewerId,
      });

      // Should only contain posts from non-muted authors
      expect(result.nextPageIds).toEqual(['author-1:post-1', 'author-3:post-3']);
    });

    it('does not filter bookmark stream posts from muted authors', async () => {
      await setupMutedUsers(['author-2'] as Pubky[]);

      const mockNexusPostsKeyStream: NexusPostsKeyStream = {
        post_keys: ['author-1:post-1', 'author-2:post-2', 'author-3:post-3'],
        last_post_score: BASE_TIMESTAMP + 2,
      };
      vi.spyOn(NexusPostStreamService, 'fetch').mockResolvedValue(mockNexusPostsKeyStream);

      const bookmarksStreamId = PostStreamTypes.TIMELINE_BOOKMARKS_ALL as PostStreamId;

      const result = await PostStreamApplication.getOrFetchStreamSlice({
        streamId: bookmarksStreamId,
        limit: 10,
        streamHead: 0,
        streamTail: 0,
        viewerId,
      });

      expect(result.nextPageIds).toEqual(['author-1:post-1', 'author-2:post-2', 'author-3:post-3']);
    });

    it('should fetch more posts until limit is reached after mute filtering', async () => {
      // Mute author-2 (7 out of 10 posts are from author-2)
      await setupMutedUsers(['author-2'] as Pubky[]);

      // First batch: 7 posts from muted user, 3 from non-muted (returns 10 posts)
      const batch1: NexusPostsKeyStream = {
        post_keys: [
          'author-1:post-1',
          'author-2:post-2',
          'author-2:post-3',
          'author-2:post-4',
          'author-1:post-5',
          'author-2:post-6',
          'author-2:post-7',
          'author-2:post-8',
          'author-2:post-9',
          'author-1:post-10',
        ],
        last_post_score: BASE_TIMESTAMP + 9,
      };

      // Second batch: all non-muted posts (returns 10 posts)
      const batch2: NexusPostsKeyStream = {
        post_keys: [
          'author-1:post-11',
          'author-3:post-12',
          'author-1:post-13',
          'author-3:post-14',
          'author-1:post-15',
          'author-3:post-16',
          'author-1:post-17',
          'author-3:post-18',
          'author-1:post-19',
          'author-3:post-20',
        ],
        last_post_score: BASE_TIMESTAMP + 19,
      };

      const nexusFetchSpy = vi
        .spyOn(NexusPostStreamService, 'fetch')
        .mockResolvedValueOnce(batch1)
        .mockResolvedValueOnce(batch2);

      const result = await PostStreamApplication.getOrFetchStreamSlice({
        streamId,
        limit: 10,
        streamHead: 0,
        streamTail: 0,
        viewerId,
      });

      // Should have fetched twice to get 10 posts after filtering
      // First batch: 3 non-muted posts, Second batch: 7 more needed
      expect(nexusFetchSpy).toHaveBeenCalledTimes(2);
      // Should return exactly 10 posts
      expect(result.nextPageIds).toHaveLength(10);
      // All posts should be from non-muted authors
      expect(result.nextPageIds.every((id) => !id.startsWith('author-2:'))).toBe(true);
    });

    it('should use queue for subsequent fetches', async () => {
      await setupMutedUsers(['author-2'] as Pubky[]);

      // Return 15 non-muted posts (enough for first request + some overflow)
      const mockNexusPostsKeyStream: NexusPostsKeyStream = {
        post_keys: Array.from({ length: 15 }, (_, i) => `author-1:post-${i + 1}`),
        last_post_score: BASE_TIMESTAMP + 14,
      };
      vi.spyOn(NexusPostStreamService, 'fetch').mockResolvedValue(mockNexusPostsKeyStream);

      // First request: get 10 posts
      const result1 = await PostStreamApplication.getOrFetchStreamSlice({
        streamId,
        limit: 10,
        streamHead: 0,
        streamTail: 0,
        viewerId,
      });

      expect(result1.nextPageIds).toHaveLength(10);

      // Check that queue has 5 remaining posts
      const queue = postStreamQueue.get(streamId);
      expect(queue?.posts).toHaveLength(5);

      // Second request: should get posts from queue without fetching from Nexus
      vi.spyOn(NexusPostStreamService, 'fetch').mockClear();

      const result2 = await PostStreamApplication.getOrFetchStreamSlice({
        streamId,
        limit: 5,
        streamHead: 0,
        streamTail: BASE_TIMESTAMP + 9,
        viewerId,
      });

      // Should return the 5 posts from queue
      expect(result2.nextPageIds).toHaveLength(5);
      // Should not have fetched from Nexus (queue had enough)
      expect(NexusPostStreamService.fetch).not.toHaveBeenCalled();
    });

    it('should handle end of stream gracefully when not enough posts', async () => {
      await setupMutedUsers(['author-2'] as Pubky[]);

      // Return only 3 non-muted posts and indicate end of stream
      const mockNexusPostsKeyStream: NexusPostsKeyStream = {
        post_keys: ['author-1:post-1', 'author-2:post-2', 'author-1:post-3', 'author-1:post-4'],
        last_post_score: BASE_TIMESTAMP + 3,
      };
      vi.spyOn(NexusPostStreamService, 'fetch').mockResolvedValue(mockNexusPostsKeyStream);

      const result = await PostStreamApplication.getOrFetchStreamSlice({
        streamId,
        limit: 10,
        streamHead: 0,
        streamTail: 0,
        viewerId,
      });

      // Should return only available non-muted posts (less than limit)
      expect(result.nextPageIds).toHaveLength(3);
      expect(result.nextPageIds).toEqual(['author-1:post-1', 'author-1:post-3', 'author-1:post-4']);
    });

    it('should re-filter queue when muted users change', async () => {
      // Initial state: no muted users, populate queue with posts from two authors
      const mockNexusPostsKeyStream: NexusPostsKeyStream = {
        post_keys: [
          'author-1:post-1',
          'author-2:post-2',
          'author-1:post-3',
          'author-2:post-4',
          'author-1:post-5',
          'author-2:post-6',
          'author-1:post-7',
          'author-2:post-8',
          'author-1:post-9',
          'author-2:post-10',
          'author-1:post-11', // Queue overflow starts here
          'author-2:post-12',
          'author-1:post-13',
          'author-2:post-14',
          'author-1:post-15',
        ],
        last_post_score: BASE_TIMESTAMP + 14,
      };
      vi.spyOn(NexusPostStreamService, 'fetch').mockResolvedValue(mockNexusPostsKeyStream);

      await PostStreamApplication.getOrFetchStreamSlice({
        streamId,
        limit: 10,
        streamHead: 0,
        streamTail: 0,
        viewerId,
      });

      // Queue should have 5 posts (11-15)
      let queue = postStreamQueue.get(streamId);
      expect(queue?.posts).toHaveLength(5);

      // Now mute author-1 - the queue should be re-filtered when next fetch occurs
      await setupMutedUsers(['author-1'] as Pubky[]);

      // Queue record still exists in memory (not yet re-filtered)
      queue = postStreamQueue.get(streamId);
      expect(queue?.posts).toHaveLength(5);

      // Mock the next fetch to return more posts from author-2
      const nextBatch: NexusPostsKeyStream = {
        post_keys: Array.from({ length: 10 }, (_, i) => `author-2:post-${i + 20}`),
        last_post_score: BASE_TIMESTAMP + 29,
      };
      vi.spyOn(NexusPostStreamService, 'fetch').mockResolvedValue(nextBatch);

      // Request 5 posts - queue has 5 but only 2 are from non-muted author-2
      // (post-12, post-14 from original queue)
      // Should re-filter queue, find only 2, then fetch more from Nexus
      const result = await PostStreamApplication.getOrFetchStreamSlice({
        streamId,
        limit: 5,
        streamHead: 0,
        streamTail: BASE_TIMESTAMP + 9,
        viewerId,
      });

      // Should get 5 posts, none from muted author-1
      expect(result.nextPageIds).toHaveLength(5);
      expect(result.nextPageIds.every((id) => !id.startsWith('author-1:'))).toBe(true);
    });

    it('should work correctly with no muted users', async () => {
      // No muted users setup

      const mockNexusPostsKeyStream: NexusPostsKeyStream = {
        post_keys: Array.from({ length: 10 }, (_, i) => `author-${i}:post-${i + 1}`),
        last_post_score: BASE_TIMESTAMP + 9,
      };
      vi.spyOn(NexusPostStreamService, 'fetch').mockResolvedValue(mockNexusPostsKeyStream);

      const result = await PostStreamApplication.getOrFetchStreamSlice({
        streamId,
        limit: 10,
        streamHead: 0,
        streamTail: 0,
        viewerId,
      });

      // All posts should be returned
      expect(result.nextPageIds).toHaveLength(10);
    });

    it('should deduplicate posts across multiple fetches in queue', async () => {
      await setupMutedUsers(['author-muted'] as Pubky[]);

      // First batch has some posts (returns 10 posts, 8 muted)
      const batch1: NexusPostsKeyStream = {
        post_keys: [
          'author-1:post-1',
          'author-muted:post-m1',
          'author-1:post-3',
          'author-muted:post-m2',
          'author-muted:post-m3',
          'author-muted:post-m4',
          'author-muted:post-m5',
          'author-muted:post-m6',
          'author-muted:post-m7',
          'author-muted:post-m8',
        ],
        last_post_score: BASE_TIMESTAMP + 9,
      };

      // Second batch has overlapping post (returns 10 posts)
      const batch2: NexusPostsKeyStream = {
        post_keys: [
          'author-1:post-3', // Duplicate
          'author-1:post-4',
          'author-1:post-5',
          'author-1:post-6',
          'author-1:post-7',
          'author-1:post-8',
          'author-1:post-9',
          'author-1:post-10',
          'author-1:post-11',
          'author-1:post-12',
        ],
        last_post_score: BASE_TIMESTAMP + 19,
      };

      vi.spyOn(NexusPostStreamService, 'fetch').mockResolvedValueOnce(batch1).mockResolvedValueOnce(batch2);

      const result = await PostStreamApplication.getOrFetchStreamSlice({
        streamId,
        limit: 10,
        streamHead: 0,
        streamTail: 0,
        viewerId,
      });

      // Should have 10 unique posts, no duplicates
      expect(result.nextPageIds).toHaveLength(10);
      expect(new Set(result.nextPageIds).size).toBe(10);
      // post-3 should appear only once
      expect(result.nextPageIds.filter((id) => id === 'author-1:post-3')).toHaveLength(1);
    });

    it('should stop at max fetch iterations when heavily muted', async () => {
      // Mute author-muted (all posts will be from muted user)
      await setupMutedUsers(['author-muted'] as Pubky[]);

      // Every fetch returns only muted posts
      const mutedBatch: NexusPostsKeyStream = {
        post_keys: Array.from({ length: 10 }, (_, i) => `author-muted:post-${i + 1}`),
        last_post_score: BASE_TIMESTAMP + 9,
      };

      const nexusFetchSpy = vi.spyOn(NexusPostStreamService, 'fetch').mockResolvedValue(mutedBatch);

      const result = await PostStreamApplication.getOrFetchStreamSlice({
        streamId,
        limit: 10,
        streamHead: 0,
        streamTail: 0,
        viewerId,
      });

      // Should stop after MAX_FETCH_ITERATIONS (20) and return partial/empty results
      // rather than looping infinitely
      expect(nexusFetchSpy).toHaveBeenCalledTimes(20);
      // All posts were muted, so we get nothing
      expect(result.nextPageIds).toHaveLength(0);
    });

    it('should return partial results when max fetch iterations reached with some valid posts', async () => {
      await setupMutedUsers(['author-muted'] as Pubky[]);

      // Each batch has 9 muted posts and 1 valid post
      let callCount = 0;
      vi.spyOn(NexusPostStreamService, 'fetch').mockImplementation(async () => {
        callCount++;
        return {
          post_keys: [
            `author-valid:post-${callCount}`,
            ...Array.from({ length: 9 }, (_, i) => `author-muted:post-${callCount * 10 + i}`),
          ],
          last_post_score: BASE_TIMESTAMP + callCount * 10,
        };
      });

      const result = await PostStreamApplication.getOrFetchStreamSlice({
        streamId,
        limit: 10,
        streamHead: 0,
        streamTail: 0,
        viewerId,
      });

      // With 10 iterations, we get 10 valid posts (1 per batch), satisfying the limit
      // With MAX_FETCH_ITERATIONS=20, we can now reach the limit before hitting the cap
      expect(result.nextPageIds).toHaveLength(10);
      expect(result.nextPageIds.every((id) => id.startsWith('author-valid:'))).toBe(true);
    });

    it('should have independent queues for different streams', async () => {
      const stream1 = PostStreamTypes.TIMELINE_ALL_ALL as PostStreamId;
      const stream2 = PostStreamTypes.TIMELINE_FOLLOWING_ALL as PostStreamId;

      // Return 15 posts for each stream
      const mockBatch: NexusPostsKeyStream = {
        post_keys: Array.from({ length: 15 }, (_, i) => `author-1:post-${i + 1}`),
        last_post_score: BASE_TIMESTAMP + 14,
      };
      vi.spyOn(NexusPostStreamService, 'fetch').mockResolvedValue(mockBatch);

      // Fetch from stream1 - should create queue with 5 overflow posts
      await PostStreamApplication.getOrFetchStreamSlice({
        streamId: stream1,
        limit: 10,
        streamHead: 0,
        streamTail: 0,
        viewerId,
      });

      // Fetch from stream2 - should create separate queue
      await PostStreamApplication.getOrFetchStreamSlice({
        streamId: stream2,
        limit: 10,
        streamHead: 0,
        streamTail: 0,
        viewerId,
      });

      // Verify each stream has its own queue
      const queue1 = postStreamQueue.get(stream1);
      const queue2 = postStreamQueue.get(stream2);

      expect(queue1?.posts).toHaveLength(5);
      expect(queue2?.posts).toHaveLength(5);

      // Queues should be independent - consuming one doesn't affect the other
      // Request remaining posts from stream1 queue
      vi.spyOn(NexusPostStreamService, 'fetch').mockClear();

      await PostStreamApplication.getOrFetchStreamSlice({
        streamId: stream1,
        limit: 5,
        streamHead: 0,
        streamTail: BASE_TIMESTAMP + 9,
        viewerId,
      });

      const queue1After = postStreamQueue.get(stream1);
      const queue2After = postStreamQueue.get(stream2);

      // stream1 queue should be deleted (consumed all 5, empty queues are deleted)
      expect(queue1After).toBeUndefined();
      // stream2 queue should be unaffected
      expect(queue2After?.posts).toHaveLength(5);
    });

    it('should handle Nexus error mid-loop and propagate error', async () => {
      await setupMutedUsers(['author-muted'] as Pubky[]);

      // First batch succeeds with some valid posts but not enough (returns 10, only 2 valid)
      // Must return exactly `limit` posts so end-of-stream is NOT triggered
      const batch1: NexusPostsKeyStream = {
        post_keys: [
          'author-valid:post-1',
          'author-valid:post-2',
          ...Array.from({ length: 8 }, (_, i) => `author-muted:post-m${i + 1}`),
        ],
        last_post_score: BASE_TIMESTAMP + 9,
      };

      vi.spyOn(NexusPostStreamService, 'fetch')
        .mockResolvedValueOnce(batch1)
        .mockRejectedValueOnce(new Error('Network error'));

      // Should throw because the error propagates
      await expect(
        PostStreamApplication.getOrFetchStreamSlice({
          streamId,
          limit: 10,
          streamHead: 0,
          streamTail: 0,
          viewerId,
        }),
      ).rejects.toThrow('Network error');
    });

    it('should preserve streamTail across multiple pagination calls', async () => {
      // Initial fetch returns 15 posts
      const batch1: NexusPostsKeyStream = {
        post_keys: Array.from({ length: 15 }, (_, i) => `author-1:post-${i + 1}`),
        last_post_score: BASE_TIMESTAMP + 14,
      };
      vi.spyOn(NexusPostStreamService, 'fetch').mockResolvedValue(batch1);

      // First call: get 10, queue should have 5 with streamTail = BASE_TIMESTAMP + 14
      await PostStreamApplication.getOrFetchStreamSlice({
        streamId,
        limit: 10,
        streamHead: 0,
        streamTail: 0,
        viewerId,
      });

      const queue = postStreamQueue.get(streamId);
      expect(queue?.cursor).toBe(BASE_TIMESTAMP + 14);
      expect(queue?.posts).toHaveLength(5);

      // Second call: should use the stored streamTail for any subsequent Nexus fetches
      vi.spyOn(NexusPostStreamService, 'fetch').mockClear();

      const result = await PostStreamApplication.getOrFetchStreamSlice({
        streamId,
        limit: 5,
        streamHead: 0,
        streamTail: 0, // This should be ignored in favor of queue's streamTail
        viewerId,
      });

      // Should get posts from queue
      expect(result.nextPageIds).toHaveLength(5);
      // Since queue had enough, no Nexus fetch should have been made
      expect(NexusPostStreamService.fetch).not.toHaveBeenCalled();

      // Queue should be deleted when empty (optimization)
      const queueAfter = postStreamQueue.get(streamId);
      expect(queueAfter).toBeUndefined();
    });

    it('should handle concurrent calls to the same stream', async () => {
      // This test documents the current behavior - concurrent calls may cause duplicate fetches
      // but should not corrupt data or throw errors

      const mockBatch: NexusPostsKeyStream = {
        post_keys: Array.from({ length: 15 }, (_, i) => `author-1:post-${i + 1}`),
        last_post_score: BASE_TIMESTAMP + 14,
      };
      vi.spyOn(NexusPostStreamService, 'fetch').mockResolvedValue(mockBatch);

      // Fire two concurrent requests
      const [result1, result2] = await Promise.all([
        PostStreamApplication.getOrFetchStreamSlice({
          streamId,
          limit: 10,
          streamHead: 0,
          streamTail: 0,
          viewerId,
        }),
        PostStreamApplication.getOrFetchStreamSlice({
          streamId,
          limit: 10,
          streamHead: 0,
          streamTail: 0,
          viewerId,
        }),
      ]);

      // Both should succeed (no errors)
      expect(result1.nextPageIds).toHaveLength(10);
      expect(result2.nextPageIds).toHaveLength(10);

      // Queue state should be consistent (one of the calls will have won the race)
      const queue = postStreamQueue.get(streamId);
      expect(queue).not.toBeUndefined();
      // Queue should have overflow posts from at least one call
      expect(queue?.posts.length).toBeGreaterThanOrEqual(0);
    });

    it('should update queue streamTail when fetching more posts', async () => {
      await setupMutedUsers(['author-muted'] as Pubky[]);

      // First batch: returns exactly limit (10) posts with only 2 valid, so loop continues
      const batch1: NexusPostsKeyStream = {
        post_keys: [
          'author-valid:post-1',
          'author-valid:post-2',
          ...Array.from({ length: 8 }, (_, i) => `author-muted:post-m${i + 1}`),
        ],
        last_post_score: BASE_TIMESTAMP + 100,
      };

      // Second batch: 10 more valid posts (overflow expected)
      const batch2: NexusPostsKeyStream = {
        post_keys: Array.from({ length: 10 }, (_, i) => `author-valid:post-${i + 10}`),
        last_post_score: BASE_TIMESTAMP + 200,
      };

      vi.spyOn(NexusPostStreamService, 'fetch').mockResolvedValueOnce(batch1).mockResolvedValueOnce(batch2);

      await PostStreamApplication.getOrFetchStreamSlice({
        streamId,
        limit: 10,
        streamHead: 0,
        streamTail: 0,
        viewerId,
      });

      // Queue's cursor should be updated to the latest fetch's timestamp
      const queue = postStreamQueue.get(streamId);
      expect(queue?.cursor).toBe(BASE_TIMESTAMP + 200);
    });
  });

  describe('getOrFetchStreamSlice with deleted post filtering', () => {
    const viewerId = 'viewer-user' as Pubky;

    it('should filter out deleted posts and fetch more to fill the limit', async () => {
      // Setup: Request 3 posts, but first batch has 2 deleted posts
      // Queue should fetch again to fill the limit

      // First batch: 5 posts, 2 are deleted -> only 3 valid
      const batch1Posts = [
        'author-1:post-1', // normal
        'author-2:post-2', // DELETED
        'author-3:post-3', // normal
        'author-4:post-4', // DELETED
        'author-5:post-5', // normal
      ];

      // Create post details
      await PostDetailsModel.create({
        id: 'author-1:post-1',
        content: 'Normal post 1',
        kind: 'short',
        indexed_at: BASE_TIMESTAMP,
        uri: 'https://pubky.app/author-1/pub/pubky.app/posts/post-1',
        attachments: null,
      });
      await PostDetailsModel.create({
        id: 'author-2:post-2',
        content: DELETED, // DELETED
        kind: 'short',
        indexed_at: BASE_TIMESTAMP + 1,
        uri: 'https://pubky.app/author-2/pub/pubky.app/posts/post-2',
        attachments: null,
      });
      await PostDetailsModel.create({
        id: 'author-3:post-3',
        content: 'Normal post 3',
        kind: 'short',
        indexed_at: BASE_TIMESTAMP + 2,
        uri: 'https://pubky.app/author-3/pub/pubky.app/posts/post-3',
        attachments: null,
      });
      await PostDetailsModel.create({
        id: 'author-4:post-4',
        content: DELETED, // DELETED
        kind: 'short',
        indexed_at: BASE_TIMESTAMP + 3,
        uri: 'https://pubky.app/author-4/pub/pubky.app/posts/post-4',
        attachments: null,
      });
      await PostDetailsModel.create({
        id: 'author-5:post-5',
        content: 'Normal post 5',
        kind: 'short',
        indexed_at: BASE_TIMESTAMP + 4,
        uri: 'https://pubky.app/author-5/pub/pubky.app/posts/post-5',
        attachments: null,
      });

      // Cache has all 5 posts
      await createStreamWithPosts(batch1Posts);

      // Mock Nexus to return empty (end of stream)
      vi.spyOn(NexusPostStreamService, 'fetch').mockResolvedValue({
        post_keys: [],
        last_post_score: 0,
      });

      const result = await PostStreamApplication.getOrFetchStreamSlice({
        streamId,
        limit: 3,
        streamHead: 0,
        streamTail: 0,
        viewerId,
      });

      // Should return exactly 3 non-deleted posts
      expect(result.nextPageIds).toHaveLength(3);
      expect(result.nextPageIds).toEqual(['author-1:post-1', 'author-3:post-3', 'author-5:post-5']);
      expect(result.nextPageIds).not.toContain('author-2:post-2');
      expect(result.nextPageIds).not.toContain('author-4:post-4');
    });

    it('should fetch more from Nexus when cache posts are mostly deleted', async () => {
      // Cache has 3 posts but 2 are deleted -> only 1 valid
      // Should fetch from Nexus to fill the limit
      const cachePostIds = ['author-1:post-1', 'author-2:post-2', 'author-3:post-3'];
      await createStreamWithPosts(cachePostIds);

      await PostDetailsModel.create({
        id: 'author-1:post-1',
        content: DELETED, // DELETED
        kind: 'short',
        indexed_at: BASE_TIMESTAMP,
        uri: 'https://pubky.app/author-1/pub/pubky.app/posts/post-1',
        attachments: null,
      });
      await PostDetailsModel.create({
        id: 'author-2:post-2',
        content: 'Normal post 2',
        kind: 'short',
        indexed_at: BASE_TIMESTAMP + 1,
        uri: 'https://pubky.app/author-2/pub/pubky.app/posts/post-2',
        attachments: null,
      });
      await PostDetailsModel.create({
        id: 'author-3:post-3',
        content: DELETED, // DELETED
        kind: 'short',
        indexed_at: BASE_TIMESTAMP + 2,
        uri: 'https://pubky.app/author-3/pub/pubky.app/posts/post-3',
        attachments: null,
      });

      // Nexus returns 2 more normal posts
      const nexusFetchSpy = vi.spyOn(NexusPostStreamService, 'fetch').mockResolvedValue({
        post_keys: ['author-4:post-4', 'author-5:post-5'],
        last_post_score: BASE_TIMESTAMP + 4,
      });

      // Also create details for Nexus posts
      await PostDetailsModel.create({
        id: 'author-4:post-4',
        content: 'Normal post 4',
        kind: 'short',
        indexed_at: BASE_TIMESTAMP + 3,
        uri: 'https://pubky.app/author-4/pub/pubky.app/posts/post-4',
        attachments: null,
      });
      await PostDetailsModel.create({
        id: 'author-5:post-5',
        content: 'Normal post 5',
        kind: 'short',
        indexed_at: BASE_TIMESTAMP + 4,
        uri: 'https://pubky.app/author-5/pub/pubky.app/posts/post-5',
        attachments: null,
      });

      const result = await PostStreamApplication.getOrFetchStreamSlice({
        streamId,
        limit: 3,
        streamHead: 0,
        streamTail: 0,
        viewerId,
      });

      // Should have fetched from Nexus
      expect(nexusFetchSpy).toHaveBeenCalled();
      // Should return 3 non-deleted posts
      expect(result.nextPageIds).toHaveLength(3);
      expect(result.nextPageIds).not.toContain('author-1:post-1');
      expect(result.nextPageIds).not.toContain('author-3:post-3');
    });
  });

  // Regression test for reply count double-counting bug.
  // When a reply is created locally, it's already counted. When that same reply arrives
  // via the unread stream (from Nexus polling), it should NOT be counted again.
  describe('reply count deduplication', () => {
    const parentAuthorId = 'parent-author' as Pubky;
    const parentPostId = 'parent-post-123';
    const parentPostCompositeId = `${parentAuthorId}:${parentPostId}`;
    const replyStreamId = `post_replies:${parentAuthorId}:${parentPostId}` as PostStreamId;

    beforeEach(async () => {
      await PostCountsModel.table.clear();
    });

    it('should not increment reply count when post already exists in database (locally created)', async () => {
      // Setup: Parent post with 1 reply (already counted from local creation)
      await PostCountsModel.create({
        id: parentPostCompositeId,
        replies: 1,
        tags: 0,
        unique_tags: 0,
        reposts: 0,
      });

      // Setup: The reply post already exists in database (was created locally)
      const replyPostId = `${DEFAULT_AUTHOR}:reply-1`;
      await PostDetailsModel.create({
        id: replyPostId,
        content: 'This is a reply',
        kind: 'short',
        indexed_at: BASE_TIMESTAMP,
        uri: `https://pubky.app/${DEFAULT_AUTHOR}/pub/pubky.app/posts/reply-1`,
        attachments: null,
      });

      // Mock Nexus returning the same reply via unread stream polling
      const mockNexusResponse: NexusPostsKeyStream = {
        post_keys: [replyPostId],
        last_post_score: BASE_TIMESTAMP,
      };
      vi.spyOn(NexusPostStreamService, 'fetch').mockResolvedValue(mockNexusResponse);

      // Trigger unread stream path (streamHead > SKIP_FETCH_NEW_POSTS)
      await PostStreamApplication.getOrFetchStreamSlice({
        streamId: replyStreamId,
        limit: 10,
        streamHead: BASE_TIMESTAMP + 1000, // Triggers unread stream code path
        streamTail: 0,
        viewerId: 'viewer' as Pubky,
      });

      // Verify: Reply count should still be 1, not 2
      const parentCounts = await PostCountsModel.findById(parentPostCompositeId);
      expect(parentCounts?.replies).toBe(1);
    });

    it('should increment reply count only for truly new posts not in database', async () => {
      // Setup: Parent post with 0 replies
      await PostCountsModel.create({
        id: parentPostCompositeId,
        replies: 0,
        tags: 0,
        unique_tags: 0,
        reposts: 0,
      });

      // No reply exists in database yet

      // Mock Nexus returning a new reply via unread stream
      const newReplyPostId = `${DEFAULT_AUTHOR}:new-reply-1`;
      const mockNexusResponse: NexusPostsKeyStream = {
        post_keys: [newReplyPostId],
        last_post_score: BASE_TIMESTAMP,
      };
      vi.spyOn(NexusPostStreamService, 'fetch').mockResolvedValue(mockNexusResponse);

      // Trigger unread stream path
      await PostStreamApplication.getOrFetchStreamSlice({
        streamId: replyStreamId,
        limit: 10,
        streamHead: BASE_TIMESTAMP + 1000,
        streamTail: 0,
        viewerId: 'viewer' as Pubky,
      });

      // Verify: Reply count should be incremented to 1 for the truly new reply
      const parentCounts = await PostCountsModel.findById(parentPostCompositeId);
      expect(parentCounts?.replies).toBe(1);
    });

    it('should correctly count mixed batch of new and existing posts', async () => {
      // Setup: Parent post with 2 replies already counted
      await PostCountsModel.create({
        id: parentPostCompositeId,
        replies: 2,
        tags: 0,
        unique_tags: 0,
        reposts: 0,
      });

      // Setup: 2 replies already exist in database
      const existingReply1 = `${DEFAULT_AUTHOR}:existing-reply-1`;
      const existingReply2 = `${DEFAULT_AUTHOR}:existing-reply-2`;
      await PostDetailsModel.create({
        id: existingReply1,
        content: 'Existing reply 1',
        kind: 'short',
        indexed_at: BASE_TIMESTAMP,
        uri: `https://pubky.app/${DEFAULT_AUTHOR}/pub/pubky.app/posts/existing-reply-1`,
        attachments: null,
      });
      await PostDetailsModel.create({
        id: existingReply2,
        content: 'Existing reply 2',
        kind: 'short',
        indexed_at: BASE_TIMESTAMP + 1,
        uri: `https://pubky.app/${DEFAULT_AUTHOR}/pub/pubky.app/posts/existing-reply-2`,
        attachments: null,
      });

      // Mock Nexus returning batch with 2 existing + 3 new replies
      const newReply1 = `${DEFAULT_AUTHOR}:new-reply-1`;
      const newReply2 = `${DEFAULT_AUTHOR}:new-reply-2`;
      const newReply3 = `${DEFAULT_AUTHOR}:new-reply-3`;
      const mockNexusResponse: NexusPostsKeyStream = {
        post_keys: [existingReply1, newReply1, existingReply2, newReply2, newReply3],
        last_post_score: BASE_TIMESTAMP + 10,
      };
      vi.spyOn(NexusPostStreamService, 'fetch').mockResolvedValue(mockNexusResponse);

      // Trigger unread stream path
      await PostStreamApplication.getOrFetchStreamSlice({
        streamId: replyStreamId,
        limit: 10,
        streamHead: BASE_TIMESTAMP + 1000,
        streamTail: 0,
        viewerId: 'viewer' as Pubky,
      });

      // Verify: Reply count should be 2 + 3 = 5 (only new replies counted)
      const parentCounts = await PostCountsModel.findById(parentPostCompositeId);
      expect(parentCounts?.replies).toBe(5);
    });

    it('should not increment reply count when post is in stream but not yet in database (race condition)', async () => {
      // This tests the race condition where:
      // 1. Local create adds reply to post stream
      // 2. Stream coordinator polls before database transaction commits
      // 3. Reply should not be double-counted

      // Setup: Parent post with 1 reply (already counted from local creation)
      await PostCountsModel.create({
        id: parentPostCompositeId,
        replies: 1,
        tags: 0,
        unique_tags: 0,
        reposts: 0,
      });

      // Setup: The reply is in the stream (added by local create) but NOT in PostDetailsModel
      // This simulates the race condition where stream update happened but DB write didn't commit
      const replyPostId = `${DEFAULT_AUTHOR}:reply-in-stream-only`;
      await PostStreamModel.upsert(replyStreamId, [replyPostId]);

      // Mock Nexus returning the same reply
      const mockNexusResponse: NexusPostsKeyStream = {
        post_keys: [replyPostId],
        last_post_score: BASE_TIMESTAMP,
      };
      vi.spyOn(NexusPostStreamService, 'fetch').mockResolvedValue(mockNexusResponse);

      // Trigger unread stream path
      await PostStreamApplication.getOrFetchStreamSlice({
        streamId: replyStreamId,
        limit: 10,
        streamHead: BASE_TIMESTAMP + 1000,
        streamTail: 0,
        viewerId: 'viewer' as Pubky,
      });

      // Verify: Reply count should still be 1 (not double-counted)
      const parentCounts = await PostCountsModel.findById(parentPostCompositeId);
      expect(parentCounts?.replies).toBe(1);
    });
  });
});
