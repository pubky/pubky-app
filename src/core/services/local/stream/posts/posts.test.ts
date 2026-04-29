import { describe, it, expect, beforeEach, vi } from 'vitest';
import { asOpaque } from '@/test-utils';
import { DatabaseErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { FORCE_FETCH_NEW_POSTS, SKIP_FETCH_NEW_POSTS } from '@/controllers/stream/posts/post.constants';
import { buildCompositeId } from '@/models/models.utils';
import { PostCountsModel } from '@/models/post/counts/postCounts';
import { PostDetailsModel } from '@/models/post/details/postDetails';
import { DELETED } from '@/models/post/details/postDetails.constants';
import { PostRelationshipsModel } from '@/models/post/relationships/postRelationships';
import { PostTagsModel } from '@/models/post/tags/postTags';
import { PostTtlModel } from '@/models/post/ttl/postTtl';
import { TagModel } from '@/models/shared/tag/tag';
import { PostStreamTypes, type PostStreamId } from '@/models/stream/post/postStream.types';
import { PostStreamModel } from '@/models/stream/post/tables/postStream';
import { UnreadPostStreamModel } from '@/models/stream/post/tables/postStream.unread';
import { LocalStreamPostsService } from '@/services/local/stream/posts/posts';
import type {
  NexusFileDetails,
  NexusFileUrls,
  NexusPost,
  NexusPostDetails,
  NexusPostWithAttachmentMetadata,
  NexusTag,
} from '@/services/nexus/nexus.types';
describe('LocalStreamPostsService', () => {
  const streamId: PostStreamId = PostStreamTypes.TIMELINE_ALL_ALL;
  const DEFAULT_AUTHOR = 'user-1';
  const BASE_TIMESTAMP = 1000000;
  const NON_EXISTENT_STREAM_ID: PostStreamId = PostStreamTypes.TIMELINE_FOLLOWING_ALL;

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
      ...(overrides?.details as NexusPostDetails | undefined),
    },
    counts: {
      replies: 0,
      tags: 0,
      unique_tags: 0,
      reposts: 0,
      ...overrides?.counts,
    },
    tags: overrides?.tags ?? [],
    relationships: {
      replied: null,
      reposted: null,
      mentioned: [],
      ...overrides?.relationships,
    },
    bookmark: null,
    ...overrides,
  });

  const postId = (id: string) => buildCompositeId({ pubky: DEFAULT_AUTHOR, id });

  const createStream = async (postIds: string[]) => {
    await LocalStreamPostsService.upsert({ streamId, stream: postIds });
  };

  const verifyStream = async (expectedPostIds: string[]) => {
    const result = await LocalStreamPostsService.read({ streamId });
    expect(result).toBeTruthy();
    expect(result!.stream).toEqual(expectedPostIds);
  };

  const verifyStreamDoesNotExist = async () => {
    const result = await LocalStreamPostsService.read({ streamId });
    expect(result).toBeNull();
  };

  const verifyPostPersisted = async (compositePostId: string, expectedContent: string) => {
    const details = await PostDetailsModel.findById(compositePostId);
    expect(details).toBeTruthy();
    expect(details?.content).toBe(expectedContent);

    const counts = await PostCountsModel.findById(compositePostId);
    expect(counts).toBeTruthy();

    const relationships = await PostRelationshipsModel.findById(compositePostId);
    expect(relationships).toBeTruthy();

    const tags = await PostTagsModel.findById(compositePostId);
    expect(tags).toBeTruthy();

    const ttl = await PostTtlModel.findById(compositePostId);
    expect(ttl).toBeTruthy();
    expect(ttl?.lastUpdatedAt).toBeGreaterThan(0);
  };

  const persistAndVerifyPost = async (
    postId: string,
    author: string,
    timestamp: number = BASE_TIMESTAMP,
    overrides?: Partial<NexusPost>,
  ) => {
    const mockPost = createMockNexusPost(postId, author, timestamp, overrides);
    const compositeId = buildCompositeId({ pubky: author, id: postId });

    const result = await LocalStreamPostsService.persistPosts({ posts: [mockPost] });

    const expectedAttachments = mockPost.details.attachments || [];
    expect(result).toEqual({ attachmentMetadata: expectedAttachments });
    return { compositeId, mockPost };
  };

  beforeEach(async () => {
    // Restore all mocks first to ensure clean state (removes any spies from previous tests)
    vi.restoreAllMocks();
    // Clear all mocks to reset call history
    vi.clearAllMocks();

    // Clear all relevant tables
    await PostStreamModel.table.clear();
    await UnreadPostStreamModel.table.clear();
    await PostDetailsModel.table.clear();
    await PostCountsModel.table.clear();
    await PostRelationshipsModel.table.clear();
    await PostTagsModel.table.clear();
    await PostTtlModel.table.clear();
  });

  describe('upsert', () => {
    it('should create a new stream with post IDs', async () => {
      const postIds = [
        buildCompositeId({ pubky: 'user1', id: 'post1' }),
        buildCompositeId({ pubky: 'user2', id: 'post2' }),
        buildCompositeId({ pubky: 'user3', id: 'post3' }),
      ];

      await LocalStreamPostsService.upsert({ streamId, stream: postIds });

      await verifyStream(postIds);
    });

    it('should update an existing stream with new post IDs', async () => {
      const initialIds = [
        buildCompositeId({ pubky: 'user1', id: 'post1' }),
        buildCompositeId({ pubky: 'user2', id: 'post2' }),
      ];
      const updatedIds = [...initialIds, buildCompositeId({ pubky: 'user3', id: 'post3' })];

      await createStream(initialIds);
      await LocalStreamPostsService.upsert({ streamId, stream: updatedIds });

      await verifyStream(updatedIds);
    });

    it('should handle empty array', async () => {
      await LocalStreamPostsService.upsert({ streamId, stream: [] });

      await verifyStream([]);
    });

    it('should propagate error when PostStreamModel.upsert throws', async () => {
      // Mock PostStreamModel.upsert to throw database error
      const databaseError = Err.database(DatabaseErrorCode.WRITE_FAILED, 'Failed to upsert PostStream', {
        service: ErrorService.Local,
        operation: 'upsert',
        context: { streamId },
      });
      vi.spyOn(PostStreamModel, 'upsert').mockRejectedValue(databaseError);

      const postIds = [buildCompositeId({ pubky: 'user1', id: 'post1' })];

      await expect(LocalStreamPostsService.upsert({ streamId, stream: postIds })).rejects.toThrow(
        'Failed to upsert PostStream',
      );
    });
  });

  describe('findById', () => {
    it('should return stream when it exists', async () => {
      const postIds = [
        buildCompositeId({ pubky: 'user1', id: 'post1' }),
        buildCompositeId({ pubky: 'user2', id: 'post2' }),
      ];
      await createStream(postIds);

      const result = await LocalStreamPostsService.read({ streamId });

      expect(result).toBeTruthy();
      expect(result!.stream).toEqual(postIds);
    });

    it('should return null when stream does not exist', async () => {
      const result = await LocalStreamPostsService.read({ streamId: NON_EXISTENT_STREAM_ID });

      expect(result).toBeNull();
    });

    it('should propagate error when PostStreamModel.findById throws', async () => {
      // Mock PostStreamModel.findById to throw database error
      const databaseError = Err.database(DatabaseErrorCode.QUERY_FAILED, 'Database query failed', {
        service: ErrorService.Local,
        operation: 'findById',
        context: { streamId },
      });
      vi.spyOn(PostStreamModel, 'findById').mockRejectedValue(databaseError);

      await expect(LocalStreamPostsService.read({ streamId })).rejects.toThrow('Database query failed');
    });
  });

  describe('deleteById', () => {
    it('should delete an existing stream', async () => {
      const postIds = [
        buildCompositeId({ pubky: 'user1', id: 'post1' }),
        buildCompositeId({ pubky: 'user2', id: 'post2' }),
      ];
      await createStream(postIds);
      await LocalStreamPostsService.deleteById({ streamId });
      await verifyStreamDoesNotExist();
    });

    it('should not throw error when deleting non-existent stream', async () => {
      await expect(LocalStreamPostsService.deleteById({ streamId: NON_EXISTENT_STREAM_ID })).resolves.not.toThrow();
    });

    it('should propagate error when PostStreamModel.deleteById throws', async () => {
      // Mock PostStreamModel.deleteById to throw database error
      const databaseError = Err.database(DatabaseErrorCode.DELETE_FAILED, 'Failed to delete stream', {
        service: ErrorService.Local,
        operation: 'deleteById',
        context: { streamId },
      });
      vi.spyOn(PostStreamModel, 'deleteById').mockRejectedValue(databaseError);

      await expect(LocalStreamPostsService.deleteById({ streamId })).rejects.toThrow('Failed to delete stream');
    });
  });

  describe('persistPosts', () => {
    it('should persist posts and return post attachments', async () => {
      const mockPosts: NexusPost[] = [createMockNexusPost('post-1', 'user-1'), createMockNexusPost('post-2', 'user-2')];

      const result = await LocalStreamPostsService.persistPosts({ posts: mockPosts });

      expect(result).toEqual({ attachmentMetadata: [] });
      await verifyPostPersisted(buildCompositeId({ pubky: 'user-1', id: 'post-1' }), 'Post post-1 content');
      await verifyPostPersisted(buildCompositeId({ pubky: 'user-2', id: 'post-2' }), 'Post post-2 content');
    });

    it('should handle posts with tags', async () => {
      const mockTag: NexusTag = {
        label: 'tech',
        taggers: ['user-2'],
        taggers_count: 1,
        relationship: true,
      };
      const { compositeId } = await persistAndVerifyPost('post-1', 'user-1', BASE_TIMESTAMP, {
        tags: [new TagModel(mockTag)],
      });

      const postTags = await PostTagsModel.findById(compositeId);
      expect(postTags).toBeTruthy();
      expect(postTags?.tags).toHaveLength(1);
      expect(postTags?.tags[0].label).toBe('tech');
      expect(postTags?.tags[0].taggers).toEqual(['user-2']);
    });

    it('should handle posts with relationships', async () => {
      const repliedUri = 'https://pubky.app/user-2/pub/pubky.app/posts/parent-post';
      const { compositeId } = await persistAndVerifyPost('post-1', 'user-1', BASE_TIMESTAMP, {
        relationships: {
          replied: repliedUri,
          reposted: null,
          mentioned: ['user-3'],
        },
      });

      const relationships = await PostRelationshipsModel.findById(compositeId);
      expect(relationships).toBeTruthy();
      expect(relationships?.replied).toBe(repliedUri);
      expect(relationships?.reposted).toBeNull();
      expect(relationships?.mentioned).toEqual(['user-3']);
    });

    it('should remove author from post details', async () => {
      const { compositeId } = await persistAndVerifyPost('post-1', 'user-1', BASE_TIMESTAMP);

      const postDetails = await PostDetailsModel.findById(compositeId);
      expect(postDetails).toBeTruthy();
      // Author should not be in details (it's in the composite ID)
      expect(asOpaque<{ author?: string }>(postDetails).author).toBeUndefined();
    });

    it('should handle empty array', async () => {
      const result = await LocalStreamPostsService.persistPosts({ posts: [] });

      expect(result).toEqual({ attachmentMetadata: [] });
    });

    it('should handle posts with empty tags array', async () => {
      const { compositeId } = await persistAndVerifyPost('post-1', 'user-1', BASE_TIMESTAMP, {
        tags: [],
      });

      const postTags = await PostTagsModel.findById(compositeId);
      expect(postTags).toBeTruthy();
      expect(postTags?.tags).toEqual([]);
    });

    it('should handle posts with multiple tags', async () => {
      const mockTag1: NexusTag = {
        label: 'tech',
        taggers: ['user-2'],
        taggers_count: 1,
        relationship: true,
      };
      const mockTag2: NexusTag = {
        label: 'coding',
        taggers: ['user-3'],
        taggers_count: 1,
        relationship: false,
      };
      const { compositeId } = await persistAndVerifyPost('post-1', 'user-1', BASE_TIMESTAMP, {
        tags: [new TagModel(mockTag1), new TagModel(mockTag2)],
      });

      const postTags = await PostTagsModel.findById(compositeId);
      expect(postTags).toBeTruthy();
      expect(postTags?.tags).toHaveLength(2);
      expect(postTags?.tags[0].label).toBe('tech');
      expect(postTags?.tags[1].label).toBe('coding');
    });

    it('should handle posts with all null relationships', async () => {
      const { compositeId } = await persistAndVerifyPost('post-1', 'user-1', BASE_TIMESTAMP, {
        relationships: {
          replied: null,
          reposted: null,
          mentioned: [],
        },
      });

      const relationships = await PostRelationshipsModel.findById(compositeId);
      expect(relationships).toBeTruthy();
      expect(relationships?.replied).toBeNull();
      expect(relationships?.reposted).toBeNull();
      expect(relationships?.mentioned).toEqual([]);
    });

    it('should propagate error when bulkSave fails', async () => {
      const mockPosts: NexusPost[] = [createMockNexusPost('post-1', 'user-1')];

      // Mock PostDetailsModel.bulkSave to throw error
      const databaseError = Err.database(DatabaseErrorCode.WRITE_FAILED, 'Failed to save post details', {
        service: ErrorService.Local,
        operation: 'bulkSave',
      });
      vi.spyOn(PostDetailsModel, 'bulkSave').mockRejectedValue(databaseError);

      await expect(LocalStreamPostsService.persistPosts({ posts: mockPosts })).rejects.toThrow(
        'Failed to save post details',
      );
    });

    it('should handle posts with different authors correctly', async () => {
      const mockPosts: NexusPost[] = [
        createMockNexusPost('post-1', 'author-1'),
        createMockNexusPost('post-2', 'author-2'),
        createMockNexusPost('post-3', 'author-1'),
      ];

      const result = await LocalStreamPostsService.persistPosts({ posts: mockPosts });

      expect(result).toEqual({ attachmentMetadata: [] });

      // Verify all posts were persisted
      await verifyPostPersisted(buildCompositeId({ pubky: 'author-1', id: 'post-1' }), 'Post post-1 content');
      await verifyPostPersisted(buildCompositeId({ pubky: 'author-2', id: 'post-2' }), 'Post post-2 content');
      await verifyPostPersisted(buildCompositeId({ pubky: 'author-1', id: 'post-3' }), 'Post post-3 content');
    });

    it('should collect and return attachments_metadata from posts', async () => {
      const fileMetadata = (id: string, uri: string): NexusFileDetails => ({
        id,
        name: id,
        src: '',
        content_type: 'image/png',
        size: 100,
        created_at: 0,
        indexed_at: 0,
        metadata: {},
        owner_id: 'user-1',
        uri,
        urls: {} as NexusFileUrls,
      });

      const meta1 = fileMetadata('file-1', 'pubky://user-1/pub/pubky.app/files/file-1');
      const meta2 = fileMetadata('file-2', 'pubky://user-1/pub/pubky.app/files/file-2');
      const meta3 = fileMetadata('file-3', 'pubky://user-2/pub/pubky.app/files/file-3');

      const mockPosts: NexusPostWithAttachmentMetadata[] = [
        { ...createMockNexusPost('post-1', 'user-1'), attachments_metadata: [meta1, meta2] },
        { ...createMockNexusPost('post-2', 'user-2'), attachments_metadata: [meta3] },
        { ...createMockNexusPost('post-3', 'user-3') },
      ];

      const result = await LocalStreamPostsService.persistPosts({ posts: mockPosts });

      expect(result).toEqual({
        attachmentMetadata: [meta1, meta2, meta3],
      });
    });

    it('should handle posts without attachments_metadata', async () => {
      const mockPosts: NexusPostWithAttachmentMetadata[] = [{ ...createMockNexusPost('post-1', 'user-1') }];

      const result = await LocalStreamPostsService.persistPosts({ posts: mockPosts });

      expect(result).toEqual({ attachmentMetadata: [] });
    });
  });

  describe('persistNewStreamChunk', () => {
    it('should append new stream chunk to existing stream', async () => {
      const initialStream = [postId('post-1'), postId('post-2')];
      const newChunk = [postId('post-3'), postId('post-4')];

      await createStream(initialStream);
      await LocalStreamPostsService.persistNewStreamChunk({ streamId, stream: newChunk });

      await verifyStream([...initialStream, ...newChunk]);
    });

    it('should create stream when it does not exist', async () => {
      const newChunk = [postId('post-1'), postId('post-2')];

      expect(await LocalStreamPostsService.read({ streamId: NON_EXISTENT_STREAM_ID })).toBeNull();

      await LocalStreamPostsService.persistNewStreamChunk({
        streamId: NON_EXISTENT_STREAM_ID,
        stream: newChunk,
      });

      const result = await LocalStreamPostsService.read({ streamId: NON_EXISTENT_STREAM_ID });
      expect(result?.stream).toEqual(newChunk);
    });

    it('should handle appending to empty stream', async () => {
      const newChunk = [postId('post-1'), postId('post-2')];

      await createStream([]);
      await LocalStreamPostsService.persistNewStreamChunk({ streamId, stream: newChunk });

      await verifyStream(newChunk);
    });

    it('should handle appending empty chunk', async () => {
      const initialStream = [postId('post-1')];

      await createStream(initialStream);
      await LocalStreamPostsService.persistNewStreamChunk({ streamId, stream: [] });

      await verifyStream(initialStream);
    });

    it('should filter duplicates when appending new chunk', async () => {
      const initialStream = [postId('post-1'), postId('post-2')];
      const newChunk = [postId('post-2'), postId('post-3')];

      await LocalStreamPostsService.persistPosts({
        posts: [
          createMockNexusPost('post-1', DEFAULT_AUTHOR, BASE_TIMESTAMP),
          createMockNexusPost('post-2', DEFAULT_AUTHOR, BASE_TIMESTAMP + 1),
          createMockNexusPost('post-3', DEFAULT_AUTHOR, BASE_TIMESTAMP + 2),
        ],
      });

      await createStream(initialStream);
      await LocalStreamPostsService.persistNewStreamChunk({
        streamId,
        stream: newChunk,
      });

      const result = await LocalStreamPostsService.read({ streamId });
      expect(result?.stream).toHaveLength(3);
      expect(result?.stream).toContain(postId('post-1'));
      expect(result?.stream).toContain(postId('post-2'));
      expect(result?.stream).toContain(postId('post-3'));
    });

    it('should sort stream by timestamp in descending order (most recent first)', async () => {
      const initialStream = [postId('post-2'), postId('post-1')];
      const newChunk = [postId('post-3')];

      await LocalStreamPostsService.persistPosts({
        posts: [
          createMockNexusPost('post-2', DEFAULT_AUTHOR, BASE_TIMESTAMP + 2),
          createMockNexusPost('post-1', DEFAULT_AUTHOR, BASE_TIMESTAMP),
          createMockNexusPost('post-3', DEFAULT_AUTHOR, BASE_TIMESTAMP + 5),
        ],
      });

      await createStream(initialStream);
      await LocalStreamPostsService.persistNewStreamChunk({ streamId, stream: newChunk });

      const result = await LocalStreamPostsService.read({ streamId });
      expect(result?.stream).toEqual([postId('post-3'), postId('post-2'), postId('post-1')]);
    });

    it('should handle posts with missing timestamps (defaults to 0)', async () => {
      const initialStream = [postId('post-1')];
      const newChunk = [postId('post-2')];

      await createStream(initialStream);
      await PostDetailsModel.create({
        id: postId('post-1'),
        content: 'Post 1',
        kind: 'short',
        indexed_at: BASE_TIMESTAMP,
        uri: `https://pubky.app/${DEFAULT_AUTHOR}/pub/pubky.app/posts/post-1`,
        attachments: null,
      });

      await LocalStreamPostsService.persistNewStreamChunk({ streamId, stream: newChunk });

      const result = await LocalStreamPostsService.read({ streamId });
      expect(result?.stream).toEqual([postId('post-1'), postId('post-2')]);
    });

    it('should handle posts with same timestamps (stable sort)', async () => {
      const initialStream = [postId('post-1'), postId('post-2')];
      const newChunk = [postId('post-3'), postId('post-4')];

      await createStream(initialStream);
      await LocalStreamPostsService.persistPosts({
        posts: [
          createMockNexusPost('post-1', DEFAULT_AUTHOR, BASE_TIMESTAMP),
          createMockNexusPost('post-2', DEFAULT_AUTHOR, BASE_TIMESTAMP),
          createMockNexusPost('post-3', DEFAULT_AUTHOR, BASE_TIMESTAMP),
          createMockNexusPost('post-4', DEFAULT_AUTHOR, BASE_TIMESTAMP),
        ],
      });

      await LocalStreamPostsService.persistNewStreamChunk({ streamId, stream: newChunk });

      const result = await LocalStreamPostsService.read({ streamId });
      expect(result?.stream).toEqual([postId('post-1'), postId('post-2'), postId('post-3'), postId('post-4')]);
    });

    it('should handle mixed timestamps correctly (some posts newer, some older)', async () => {
      const initialStream = [postId('post-1'), postId('post-2')];
      const newChunk = [postId('post-3'), postId('post-4')];

      await LocalStreamPostsService.persistPosts({
        posts: [
          createMockNexusPost('post-1', DEFAULT_AUTHOR, BASE_TIMESTAMP),
          createMockNexusPost('post-2', DEFAULT_AUTHOR, BASE_TIMESTAMP + 1),
          createMockNexusPost('post-3', DEFAULT_AUTHOR, BASE_TIMESTAMP + 5),
          createMockNexusPost('post-4', DEFAULT_AUTHOR, BASE_TIMESTAMP - 1),
        ],
      });

      await createStream(initialStream);
      await LocalStreamPostsService.persistNewStreamChunk({ streamId, stream: newChunk });

      const result = await LocalStreamPostsService.read({ streamId });
      expect(result?.stream).toEqual([postId('post-3'), postId('post-2'), postId('post-1'), postId('post-4')]);
    });

    it('should handle duplicates within new chunk itself', async () => {
      const initialStream = [postId('post-1')];
      const newChunk = [postId('post-2'), postId('post-2'), postId('post-3')];

      await LocalStreamPostsService.persistPosts({
        posts: [
          createMockNexusPost('post-1', DEFAULT_AUTHOR, BASE_TIMESTAMP),
          createMockNexusPost('post-2', DEFAULT_AUTHOR, BASE_TIMESTAMP + 1),
          createMockNexusPost('post-3', DEFAULT_AUTHOR, BASE_TIMESTAMP + 2),
        ],
      });

      await createStream(initialStream);
      await LocalStreamPostsService.persistNewStreamChunk({ streamId, stream: newChunk });

      const result = await LocalStreamPostsService.read({ streamId });
      expect(result?.stream.filter((id) => id === postId('post-2')).length).toBe(2);
      expect(result?.stream).toHaveLength(4);
    });

    it('should propagate error when PostStreamModel.findById throws in persistNewStreamChunk', async () => {
      const databaseError = Err.database(DatabaseErrorCode.QUERY_FAILED, 'Database query failed', {
        service: ErrorService.Local,
        operation: 'findById',
        context: { streamId },
      });
      vi.spyOn(PostStreamModel, 'findById').mockRejectedValue(databaseError);

      await expect(
        LocalStreamPostsService.persistNewStreamChunk({
          streamId,
          stream: [postId('post-1')],
        }),
      ).rejects.toThrow('Database query failed');
    });

    it('should propagate error when PostDetailsModel.findByIdsPreserveOrder throws', async () => {
      await createStream([postId('post-1')]);

      const databaseError = Err.database(DatabaseErrorCode.QUERY_FAILED, 'Database query failed', {
        service: ErrorService.Local,
        operation: 'findByIdsPreserveOrder',
      });
      vi.spyOn(PostDetailsModel, 'findByIdsPreserveOrder').mockRejectedValue(databaseError);

      await expect(
        LocalStreamPostsService.persistNewStreamChunk({
          streamId,
          stream: [postId('post-2')],
        }),
      ).rejects.toThrow('Database query failed');
    });

    it('should propagate error when PostStreamModel.upsert throws in persistNewStreamChunk', async () => {
      await createStream([postId('post-1')]);
      await LocalStreamPostsService.persistPosts({
        posts: [createMockNexusPost('post-1', DEFAULT_AUTHOR), createMockNexusPost('post-2', DEFAULT_AUTHOR)],
      });

      const databaseError = Err.database(DatabaseErrorCode.WRITE_FAILED, 'Failed to upsert stream', {
        service: ErrorService.Local,
        operation: 'upsert',
        context: { streamId },
      });
      vi.spyOn(PostStreamModel, 'upsert').mockRejectedValue(databaseError);

      await expect(
        LocalStreamPostsService.persistNewStreamChunk({
          streamId,
          stream: [postId('post-2')],
        }),
      ).rejects.toThrow('Failed to upsert stream');
    });
  });

  describe('getStreamHead', () => {
    it('should return timestamp from unread stream when it exists', async () => {
      const unreadPostId = postId('unread-post');
      const postId1 = postId('post-1');
      const timestamp = BASE_TIMESTAMP + 100;

      // Create unread stream
      await UnreadPostStreamModel.upsert(streamId as PostStreamId, [unreadPostId]);
      await PostDetailsModel.create({
        id: unreadPostId,
        content: 'Unread post',
        kind: 'short',
        indexed_at: timestamp,
        uri: `https://pubky.app/${DEFAULT_AUTHOR}/pub/pubky.app/posts/unread-post`,
        attachments: null,
      });

      // Create post stream (should not be used)
      await createStream([postId1]);
      await PostDetailsModel.create({
        id: postId1,
        content: 'Post 1',
        kind: 'short',
        indexed_at: BASE_TIMESTAMP,
        uri: `https://pubky.app/${DEFAULT_AUTHOR}/pub/pubky.app/posts/post-1`,
        attachments: null,
      });

      const result = await LocalStreamPostsService.getStreamHead({ streamId });

      expect(result).toBe(timestamp);
    });

    it('should return timestamp from post stream when unread stream does not exist', async () => {
      const postId1 = postId('post-1');
      const timestamp = BASE_TIMESTAMP + 50;

      await createStream([postId1]);
      await PostDetailsModel.create({
        id: postId1,
        content: 'Post 1',
        kind: 'short',
        indexed_at: timestamp,
        uri: `https://pubky.app/${DEFAULT_AUTHOR}/pub/pubky.app/posts/post-1`,
        attachments: null,
      });

      const result = await LocalStreamPostsService.getStreamHead({ streamId });

      expect(result).toBe(timestamp);
    });

    it('should return FORCE_FETCH_NEW_POSTS when stream does not exist', async () => {
      const result = await LocalStreamPostsService.getStreamHead({
        streamId: NON_EXISTENT_STREAM_ID,
      });

      expect(result).toBe(FORCE_FETCH_NEW_POSTS);
    });

    it('should return SKIP_FETCH_NEW_POSTS when post details not found', async () => {
      const postId1 = postId('post-1');

      await createStream([postId1]);
      // Don't create post details

      const result = await LocalStreamPostsService.getStreamHead({ streamId });

      expect(result).toBe(SKIP_FETCH_NEW_POSTS);
    });

    it('should propagate error when underlying model throws', async () => {
      const databaseError = Err.database(DatabaseErrorCode.QUERY_FAILED, 'Database query failed', {
        service: ErrorService.Local,
        operation: 'getStreamHead',
        context: { streamId },
      });
      vi.spyOn(UnreadPostStreamModel, 'getStreamHead').mockRejectedValue(databaseError);

      await expect(LocalStreamPostsService.getStreamHead({ streamId })).rejects.toThrow('Database query failed');
    });

    it('should return timestamp from post stream when unread stream is empty', async () => {
      const postId1 = postId('post-1');
      const timestamp = BASE_TIMESTAMP + 50;

      // Create empty unread stream
      await UnreadPostStreamModel.upsert(streamId as PostStreamId, [] as string[]);

      // Create post stream with valid post
      await createStream([postId1]);
      await PostDetailsModel.create({
        id: postId1,
        content: 'Post 1',
        kind: 'short',
        indexed_at: timestamp,
        uri: `https://pubky.app/${DEFAULT_AUTHOR}/pub/pubky.app/posts/post-1`,
        attachments: null,
      });

      const result = await LocalStreamPostsService.getStreamHead({ streamId });

      // Should fall through to post stream since unread is empty
      expect(result).toBe(timestamp);
    });

    it('should return FORCE_FETCH_NEW_POSTS when post stream is empty', async () => {
      // Create empty post stream
      await createStream([]);

      const result = await LocalStreamPostsService.getStreamHead({ streamId });

      expect(result).toBe(FORCE_FETCH_NEW_POSTS);
    });

    it('should return SKIP_FETCH_NEW_POSTS when unread stream head exists but post details missing', async () => {
      const unreadPostId = postId('unread-post');

      // Create unread stream with post ID
      await UnreadPostStreamModel.upsert(streamId as PostStreamId, [unreadPostId]);
      // Don't create post details

      const result = await LocalStreamPostsService.getStreamHead({ streamId });

      expect(result).toBe(SKIP_FETCH_NEW_POSTS);
    });

    it('should return FORCE_FETCH_NEW_POSTS when both streams are empty', async () => {
      // Create empty unread stream
      await UnreadPostStreamModel.upsert(streamId as PostStreamId, [] as string[]);
      // Create empty post stream
      await createStream([]);

      const result = await LocalStreamPostsService.getStreamHead({ streamId });

      expect(result).toBe(FORCE_FETCH_NEW_POSTS);
    });

    it('should return SKIP_FETCH_NEW_POSTS when unread stream is empty and post stream head exists but details missing', async () => {
      const postId1 = postId('post-1');

      // Create empty unread stream
      await UnreadPostStreamModel.upsert(streamId as PostStreamId, [] as string[]);

      // Create post stream with post ID but no details
      await createStream([postId1]);
      // Don't create post details

      const result = await LocalStreamPostsService.getStreamHead({ streamId });

      expect(result).toBe(SKIP_FETCH_NEW_POSTS);
    });
  });

  describe('prependToStream', () => {
    it('should prepend post ID to existing stream', async () => {
      const initialStream = [postId('post-1'), postId('post-2')];
      const newPostId = postId('post-0');

      await createStream(initialStream);
      await LocalStreamPostsService.prependToStream({ streamId, compositePostId: newPostId });

      await verifyStream([newPostId, ...initialStream]);
    });

    it('should create new stream if it does not exist', async () => {
      const newPostId = postId('post-1');

      await LocalStreamPostsService.prependToStream({ streamId, compositePostId: newPostId });

      await verifyStream([newPostId]);
    });

    it('should not add if post ID already exists in stream', async () => {
      const initialStream = [postId('post-1'), postId('post-2')];
      const existingPostId = postId('post-1');

      await createStream(initialStream);
      await LocalStreamPostsService.prependToStream({ streamId, compositePostId: existingPostId });

      // Stream should remain unchanged
      await verifyStream(initialStream);
    });

    it('should propagate error when underlying model throws', async () => {
      const databaseError = Err.database(DatabaseErrorCode.QUERY_FAILED, 'Database query failed', {
        service: ErrorService.Local,
        operation: 'prependToStream',
        context: { streamId },
      });
      vi.spyOn(PostStreamModel, 'findById').mockRejectedValue(databaseError);

      await expect(
        LocalStreamPostsService.prependToStream({ streamId, compositePostId: postId('post-1') }),
      ).rejects.toThrow('Database query failed');
    });
  });

  describe('removeFromStream', () => {
    it('should remove post ID from existing stream', async () => {
      const initialStream = [postId('post-1'), postId('post-2'), postId('post-3')];
      const postToRemove = postId('post-2');

      await createStream(initialStream);
      await LocalStreamPostsService.removeFromStream({ streamId, compositePostId: postToRemove });

      await verifyStream([postId('post-1'), postId('post-3')]);
    });

    it('should do nothing if stream does not exist', async () => {
      await expect(
        LocalStreamPostsService.removeFromStream({
          streamId: NON_EXISTENT_STREAM_ID,
          compositePostId: postId('post-1'),
        }),
      ).resolves.not.toThrow();
    });

    it('should remove all occurrences if post ID appears multiple times', async () => {
      const postToRemove = postId('post-2');
      const initialStream = [postId('post-1'), postToRemove, postId('post-3'), postToRemove];

      await createStream(initialStream);
      await LocalStreamPostsService.removeFromStream({ streamId, compositePostId: postToRemove });

      await verifyStream([postId('post-1'), postId('post-3')]);
    });

    it('should propagate error when underlying model throws', async () => {
      const databaseError = Err.database(DatabaseErrorCode.QUERY_FAILED, 'Database query failed', {
        service: ErrorService.Local,
        operation: 'removeFromStream',
        context: { streamId },
      });
      vi.spyOn(PostStreamModel, 'findById').mockRejectedValue(databaseError);

      await expect(
        LocalStreamPostsService.removeFromStream({ streamId, compositePostId: postId('post-1') }),
      ).rejects.toThrow('Database query failed');
    });
  });

  describe('mergeUnreadStreamWithPostStream', () => {
    it('should merge unread and post streams', async () => {
      const unreadStream = [postId('unread-1'), postId('unread-2')];
      const postStream = [postId('post-1'), postId('post-2')];

      await UnreadPostStreamModel.upsert(streamId as PostStreamId, unreadStream);
      await createStream(postStream);

      await LocalStreamPostsService.mergeUnreadStreamWithPostStream({ streamId });

      const result = await LocalStreamPostsService.read({ streamId });
      expect(result?.stream).toEqual([...unreadStream, ...postStream]);
    });

    it('should do nothing if unread stream does not exist', async () => {
      await createStream([postId('post-1')]);

      await LocalStreamPostsService.mergeUnreadStreamWithPostStream({ streamId });

      // Stream should remain unchanged
      await verifyStream([postId('post-1')]);
    });

    it('should do nothing if post stream does not exist', async () => {
      await UnreadPostStreamModel.upsert(streamId as PostStreamId, [postId('unread-1')]);

      await LocalStreamPostsService.mergeUnreadStreamWithPostStream({ streamId });

      // Post stream should not be created
      const result = await LocalStreamPostsService.read({ streamId });
      expect(result).toBeNull();
    });

    it('should propagate error when underlying model throws', async () => {
      const databaseError = Err.database(DatabaseErrorCode.QUERY_FAILED, 'Database query failed', {
        service: ErrorService.Local,
        operation: 'mergeUnreadStreamWithPostStream',
        context: { streamId },
      });
      vi.spyOn(UnreadPostStreamModel, 'findById').mockRejectedValue(databaseError);

      await expect(LocalStreamPostsService.mergeUnreadStreamWithPostStream({ streamId })).rejects.toThrow(
        'Database query failed',
      );
    });

    it('should deduplicate posts that exist in both streams', async () => {
      const sharedPostId = postId('shared-post');
      const unreadStream = [postId('unread-1'), sharedPostId];
      const postStream = [sharedPostId, postId('post-1')];

      await UnreadPostStreamModel.upsert(streamId as PostStreamId, unreadStream);
      await createStream(postStream);

      await LocalStreamPostsService.mergeUnreadStreamWithPostStream({ streamId });

      const result = await LocalStreamPostsService.read({ streamId });
      // Shared post should only appear once, from the unread stream
      expect(result?.stream).toEqual([postId('unread-1'), sharedPostId, postId('post-1')]);
    });

    it('should filter out deleted posts from unread stream during merge', async () => {
      // Setup: unread stream has a deleted post and a normal post
      const deletedPostId = postId('deleted-post');
      const normalUnreadPostId = postId('unread-normal');
      const unreadStream = [deletedPostId, normalUnreadPostId];
      const postStream = [postId('post-1')];

      // Create post details - one deleted, one normal
      await PostDetailsModel.create({
        id: deletedPostId,
        content: DELETED,
        kind: 'short',
        indexed_at: BASE_TIMESTAMP + 2,
        uri: `https://pubky.app/${DEFAULT_AUTHOR}/pub/pubky.app/posts/deleted-post`,
        attachments: null,
      });
      await PostDetailsModel.create({
        id: normalUnreadPostId,
        content: 'Normal unread post',
        kind: 'short',
        indexed_at: BASE_TIMESTAMP + 1,
        uri: `https://pubky.app/${DEFAULT_AUTHOR}/pub/pubky.app/posts/unread-normal`,
        attachments: null,
      });
      await PostDetailsModel.create({
        id: postId('post-1'),
        content: 'Post 1',
        kind: 'short',
        indexed_at: BASE_TIMESTAMP,
        uri: `https://pubky.app/${DEFAULT_AUTHOR}/pub/pubky.app/posts/post-1`,
        attachments: null,
      });

      await UnreadPostStreamModel.upsert(streamId as PostStreamId, unreadStream);
      await createStream(postStream);

      await LocalStreamPostsService.mergeUnreadStreamWithPostStream({ streamId });

      const result = await LocalStreamPostsService.read({ streamId });
      // Deleted post should NOT be in the merged stream
      expect(result?.stream).not.toContain(deletedPostId);
      // Normal posts should be present, sorted by timestamp (descending)
      expect(result?.stream).toEqual([normalUnreadPostId, postId('post-1')]);
    });
  });

  describe('persistUnreadNewStreamChunk', () => {
    it('should create new unread stream if it does not exist', async () => {
      const newChunk = [postId('post-1'), postId('post-2')];

      await LocalStreamPostsService.persistUnreadNewStreamChunk({
        streamId,
        stream: newChunk,
      });

      const result = await UnreadPostStreamModel.findById(streamId as PostStreamId);
      expect(result?.stream).toEqual(newChunk);
    });

    it('should prepend new posts to existing unread stream', async () => {
      const initialStream = [postId('post-3'), postId('post-4')];
      const newChunk = [postId('post-1'), postId('post-2')];

      await UnreadPostStreamModel.upsert(streamId as PostStreamId, initialStream);
      await LocalStreamPostsService.persistUnreadNewStreamChunk({
        streamId,
        stream: newChunk,
      });

      const result = await UnreadPostStreamModel.findById(streamId as PostStreamId);
      expect(result?.stream).toEqual([...newChunk, ...initialStream]);
    });

    it('should filter duplicates when appending', async () => {
      const initialStream = [postId('post-1'), postId('post-2')];
      const newChunk = [postId('post-2'), postId('post-3')];

      await UnreadPostStreamModel.upsert(streamId as PostStreamId, initialStream);
      await LocalStreamPostsService.persistUnreadNewStreamChunk({
        streamId,
        stream: newChunk,
      });

      const result = await UnreadPostStreamModel.findById(streamId as PostStreamId);
      expect(result?.stream).toEqual([postId('post-3'), ...initialStream]);
    });

    it('should do nothing if all new posts are duplicates', async () => {
      const initialStream = [postId('post-1'), postId('post-2')];
      const newChunk = [postId('post-1'), postId('post-2')];

      await UnreadPostStreamModel.upsert(streamId as PostStreamId, initialStream);
      await LocalStreamPostsService.persistUnreadNewStreamChunk({
        streamId,
        stream: newChunk,
      });

      const result = await UnreadPostStreamModel.findById(streamId as PostStreamId);
      expect(result?.stream).toEqual(initialStream);
    });

    // Regression test for reply count bug: when duplicate posts arrive in batches,
    // the function must return only the actually new posts so counts are updated correctly.
    // Previously, the function returned void and the caller used the full batch size,
    // causing reply counts to inflate when the same posts arrived multiple times.
    it('should return only actually new post IDs to prevent count inflation from duplicates', async () => {
      const initialStream = [postId('post-1'), postId('post-2')];
      // Batch contains 3 posts, but 2 are duplicates
      const batchWithDuplicates = [postId('post-2'), postId('post-3'), postId('post-1')];

      await UnreadPostStreamModel.upsert(streamId as PostStreamId, initialStream);

      const newPostIds = await LocalStreamPostsService.persistUnreadNewStreamChunk({
        streamId,
        stream: batchWithDuplicates,
      });

      // Must return only the 1 new post, not 3 (the batch size)
      // This is critical: using batch size (3) instead of actual new count (1)
      // would cause reply counts to be inflated by 2 extra
      expect(newPostIds).toEqual([postId('post-3')]);
      expect(newPostIds.length).toBe(1);
    });

    it('should return all posts when stream does not exist yet', async () => {
      const newChunk = [postId('post-1'), postId('post-2'), postId('post-3')];

      const newPostIds = await LocalStreamPostsService.persistUnreadNewStreamChunk({
        streamId,
        stream: newChunk,
      });

      expect(newPostIds).toEqual(newChunk);
      expect(newPostIds.length).toBe(3);
    });

    it('should return empty array when all posts are duplicates', async () => {
      const initialStream = [postId('post-1'), postId('post-2')];
      const allDuplicates = [postId('post-1'), postId('post-2')];

      await UnreadPostStreamModel.upsert(streamId as PostStreamId, initialStream);

      const newPostIds = await LocalStreamPostsService.persistUnreadNewStreamChunk({
        streamId,
        stream: allDuplicates,
      });

      // Must return empty array, not the batch size of 2
      expect(newPostIds).toEqual([]);
      expect(newPostIds.length).toBe(0);
    });

    it('should propagate error when underlying model throws', async () => {
      const databaseError = Err.database(DatabaseErrorCode.QUERY_FAILED, 'Database query failed', {
        service: ErrorService.Local,
        operation: 'persistUnreadNewStreamChunk',
        context: { streamId },
      });
      vi.spyOn(UnreadPostStreamModel, 'findById').mockRejectedValue(databaseError);

      await expect(
        LocalStreamPostsService.persistUnreadNewStreamChunk({
          streamId,
          stream: [postId('post-1')],
        }),
      ).rejects.toThrow('Database query failed');
    });
  });

  describe('bulkSave', () => {
    it('should save multiple streams', async () => {
      const streamId1 = PostStreamTypes.TIMELINE_ALL_ALL;
      const streamId2 = PostStreamTypes.TIMELINE_FOLLOWING_ALL;
      const stream1 = [postId('post-1'), postId('post-2')];
      const stream2 = [postId('post-3'), postId('post-4')];

      await LocalStreamPostsService.bulkSave({
        postStreams: [
          { streamId: streamId1, stream: stream1 },
          { streamId: streamId2, stream: stream2 },
        ],
      });

      const result1 = await LocalStreamPostsService.read({ streamId: streamId1 });
      const result2 = await LocalStreamPostsService.read({ streamId: streamId2 });

      expect(result1?.stream).toEqual(stream1);
      expect(result2?.stream).toEqual(stream2);
    });

    it('should propagate error when upsert throws', async () => {
      const databaseError = Err.database(DatabaseErrorCode.WRITE_FAILED, 'Failed to upsert stream', {
        service: ErrorService.Local,
        operation: 'bulkSave',
        context: { streamId },
      });
      vi.spyOn(PostStreamModel, 'upsert').mockRejectedValue(databaseError);

      await expect(
        LocalStreamPostsService.bulkSave({
          postStreams: [{ streamId, stream: [postId('post-1')] }],
        }),
      ).rejects.toThrow('Failed to upsert stream');
    });
  });

  describe('readUnreadStream', () => {
    it('should return unread stream when it exists', async () => {
      const unreadPostIds = [postId('unread-1'), postId('unread-2')];
      await UnreadPostStreamModel.upsert(streamId as PostStreamId, unreadPostIds);

      const result = await LocalStreamPostsService.readUnreadStream({ streamId });

      expect(result).toBeTruthy();
      expect(result!.stream).toEqual(unreadPostIds);
    });

    it('should return null when unread stream does not exist', async () => {
      const result = await LocalStreamPostsService.readUnreadStream({
        streamId: NON_EXISTENT_STREAM_ID,
      });

      expect(result).toBeNull();
    });

    it('should propagate error when UnreadPostStreamModel.findById throws', async () => {
      const databaseError = Err.database(DatabaseErrorCode.QUERY_FAILED, 'Database query failed', {
        service: ErrorService.Local,
        operation: 'readUnreadStream',
        context: { streamId },
      });
      vi.spyOn(UnreadPostStreamModel, 'findById').mockRejectedValue(databaseError);

      await expect(LocalStreamPostsService.readUnreadStream({ streamId })).rejects.toThrow('Database query failed');
    });
  });

  describe('clearUnreadStream', () => {
    it('should clear unread stream and return post IDs', async () => {
      const unreadPostIds = [postId('unread-1'), postId('unread-2'), postId('unread-3')];
      await UnreadPostStreamModel.upsert(streamId as PostStreamId, unreadPostIds);

      const result = await LocalStreamPostsService.clearUnreadStream({ streamId });

      expect(result).toEqual(unreadPostIds);
      const clearedStream = await UnreadPostStreamModel.findById(streamId as PostStreamId);
      expect(clearedStream).toBeNull();
    });

    it('should return empty array when unread stream does not exist', async () => {
      const result = await LocalStreamPostsService.clearUnreadStream({
        streamId: NON_EXISTENT_STREAM_ID,
      });

      expect(result).toEqual([]);
    });

    it('should handle empty unread stream', async () => {
      await UnreadPostStreamModel.create(streamId as PostStreamId, [] as string[]);

      const result = await LocalStreamPostsService.clearUnreadStream({ streamId });

      expect(result).toEqual([]);
      const clearedStream = await UnreadPostStreamModel.findById(streamId as PostStreamId);
      expect(clearedStream).toBeNull();
    });

    it('should propagate error when UnreadPostStreamModel.findById throws', async () => {
      const databaseError = Err.database(DatabaseErrorCode.QUERY_FAILED, 'Database query failed', {
        service: ErrorService.Local,
        operation: 'clearUnreadStream',
        context: { streamId },
      });
      vi.spyOn(UnreadPostStreamModel, 'findById').mockRejectedValue(databaseError);

      await expect(LocalStreamPostsService.clearUnreadStream({ streamId })).rejects.toThrow('Database query failed');
    });

    it('should propagate error when UnreadPostStreamModel.deleteById throws', async () => {
      const unreadPostIds = [postId('unread-1')];
      await UnreadPostStreamModel.upsert(streamId as PostStreamId, unreadPostIds);

      const databaseError = Err.database(DatabaseErrorCode.DELETE_FAILED, 'Failed to delete unread stream', {
        service: ErrorService.Local,
        operation: 'clearUnreadStream',
        context: { streamId },
      });
      vi.spyOn(UnreadPostStreamModel, 'deleteById').mockRejectedValue(databaseError);

      await expect(LocalStreamPostsService.clearUnreadStream({ streamId })).rejects.toThrow(
        'Failed to delete unread stream',
      );
    });
  });

  describe('getNotPersistedPostsInCache', () => {
    it('should return post IDs that are not in cache', async () => {
      const postIds = [postId('post-1'), postId('post-2'), postId('post-3')];
      // Only persist post-1
      await PostDetailsModel.create({
        id: postId('post-1'),
        content: 'Post 1',
        kind: 'short',
        indexed_at: BASE_TIMESTAMP,
        uri: `https://pubky.app/${DEFAULT_AUTHOR}/pub/pubky.app/posts/post-1`,
        attachments: null,
      });

      const result = await LocalStreamPostsService.getNotPersistedPostsInCache(postIds);

      expect(result).toEqual([postId('post-2'), postId('post-3')]);
    });

    it('should return empty array when all posts are in cache', async () => {
      const postIds = [postId('post-1'), postId('post-2')];
      // Persist both posts
      await PostDetailsModel.create({
        id: postId('post-1'),
        content: 'Post 1',
        kind: 'short',
        indexed_at: BASE_TIMESTAMP,
        uri: `https://pubky.app/${DEFAULT_AUTHOR}/pub/pubky.app/posts/post-1`,
        attachments: null,
      });
      await PostDetailsModel.create({
        id: postId('post-2'),
        content: 'Post 2',
        kind: 'short',
        indexed_at: BASE_TIMESTAMP + 1,
        uri: `https://pubky.app/${DEFAULT_AUTHOR}/pub/pubky.app/posts/post-2`,
        attachments: null,
      });

      const result = await LocalStreamPostsService.getNotPersistedPostsInCache(postIds);

      expect(result).toEqual([]);
    });

    it('should return all post IDs when none are in cache', async () => {
      const postIds = [postId('post-1'), postId('post-2')];

      const result = await LocalStreamPostsService.getNotPersistedPostsInCache(postIds);

      expect(result).toEqual(postIds);
    });

    it('should handle empty array', async () => {
      const result = await LocalStreamPostsService.getNotPersistedPostsInCache([]);

      expect(result).toEqual([]);
    });

    it('should preserve order of missing posts', async () => {
      const postIds = [postId('post-1'), postId('post-2'), postId('post-3'), postId('post-4')];
      // Only persist post-2
      await PostDetailsModel.create({
        id: postId('post-2'),
        content: 'Post 2',
        kind: 'short',
        indexed_at: BASE_TIMESTAMP,
        uri: `https://pubky.app/${DEFAULT_AUTHOR}/pub/pubky.app/posts/post-2`,
        attachments: null,
      });

      const result = await LocalStreamPostsService.getNotPersistedPostsInCache(postIds);

      // Should preserve order: post-1, post-3, post-4 (post-2 is filtered out)
      expect(result).toEqual([postId('post-1'), postId('post-3'), postId('post-4')]);
    });

    it('should propagate error when PostDetailsModel.findByIdsPreserveOrder throws', async () => {
      const postIds = [postId('post-1')];
      const databaseError = Err.database(DatabaseErrorCode.QUERY_FAILED, 'Database query failed', {
        service: ErrorService.Local,
        operation: 'getNotPersistedPostsInCache',
      });
      vi.spyOn(PostDetailsModel, 'findByIdsPreserveOrder').mockRejectedValue(databaseError);

      await expect(LocalStreamPostsService.getNotPersistedPostsInCache(postIds)).rejects.toThrow(
        'Database query failed',
      );
    });
  });
});
