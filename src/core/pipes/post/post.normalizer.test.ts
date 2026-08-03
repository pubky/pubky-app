import { type FileResult, PostResult, PubkyAppPost, PubkyAppPostEmbed, PubkyAppPostKind } from 'pubky-app-specs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COLLECTION_LAYOUT } from '@/config/collections';
import { Logger } from '@/libs/logger/logger';
import { PostDetailsModel } from '@/models/post/details/postDetails';
import type { PostDetailsModelSchema } from '@/models/post/details/postDetails.schema';
import { PostRelationshipsModel } from '@/models/post/relationships/postRelationships';
import type { PostRelationshipsModelSchema } from '@/models/post/relationships/postRelationships.schema';
import type { TFileAttachmentResult } from '@/pipes/file/file.types';
import { PubkySpecsSingleton } from '@/pipes/pipes.builder';
import type { PostValidatorData } from '@/pipes/pipes.types';
import { PostNormalizer } from '@/pipes/post/post.normalizer';
import { asInvalid, asOpaque } from '@/test-utils/type-assertions';
import {
  buildPubkyUri,
  restoreMocks,
  setupIntegrationTestMocks,
  setupUnitTestMocks,
  TEST_POST_IDS,
  TEST_PUBKY,
} from '../pipes.test-utils';

const spyOnBuildCompositeIdFromPubkyUri = async () =>
  vi.spyOn(await import('@/models/models.utils'), 'buildCompositeIdFromPubkyUri');

describe('PostNormalizer', () => {
  // Test data factories
  const createBasicPost = (overrides?: Partial<PostValidatorData>): PostValidatorData => ({
    content: 'Hello, world!',
    kind: PubkyAppPostKind.Short,
    ...overrides,
  });

  const createMockFileResult = (id: string): FileResult =>
    asOpaque<FileResult>({
      file: { toJson: vi.fn(() => ({ id, src: `blob-${id}`, content_type: 'image/png', size: 1024 })) },
      meta: { url: buildPubkyUri(TEST_PUBKY.USER_1, `files/${id}`) },
    });

  const createMockAttachment = (id: string): TFileAttachmentResult => ({
    blobResult: asOpaque<TFileAttachmentResult['blobResult']>({
      blob: { data: new Uint8Array([1, 2, 3]) },
      meta: { url: buildPubkyUri(TEST_PUBKY.USER_1, `blobs/${id}`) },
    }),
    fileResult: createMockFileResult(id),
  });

  const createMockPostDetails = (id: string, kind = 'short'): PostDetailsModelSchema => ({
    id,
    content: 'Mock content',
    kind,
    uri: buildPubkyUri(TEST_PUBKY.USER_1, `posts/${id}`),
    indexed_at: Date.now(),
    attachments: null,
  });

  const createMockBuilder = (
    overrides?: Partial<{ createPost: ReturnType<typeof vi.fn>; createCollectionPost: ReturnType<typeof vi.fn> }>,
  ) => ({
    createPost: vi.fn((content, kind, parent, embed, attachments) =>
      asOpaque<PostResult>({
        post: {
          content,
          kind,
          parent: parent || undefined,
          embed: embed || undefined,
          attachments: attachments || undefined,
        },
        meta: { url: buildPubkyUri(TEST_PUBKY.USER_1, `posts/${TEST_POST_IDS.POST_1}`) },
      }),
    ),
    createCollectionPost: vi.fn((name, description, items, cover_image, layout) =>
      asOpaque<PostResult>({
        post: {
          content: JSON.stringify({
            name,
            description: description ?? '',
            items: items ?? [],
            cover_image: cover_image ?? null,
            layout: layout ?? null,
          }),
          kind: 'collection',
          parent: undefined,
          embed: undefined,
          attachments: undefined,
        },
        meta: { url: buildPubkyUri(TEST_PUBKY.USER_1, `posts/${TEST_POST_IDS.POST_1}`) },
      }),
    ),
    ...overrides,
  });

  /**
   * Tests for `postKindToLowerCase` - Simple string transformation
   */
  describe('postKindToLowerCase', () => {
    it.each([
      ['SHORT', 'short'],
      ['LoNg', 'long'],
      ['short', 'short'],
      ['TYPE-123', 'type-123'],
      ['MIXED_Case', 'mixed_case'],
    ])('should convert "%s" to "%s"', (input, expected) => {
      expect(PostNormalizer.postKindToLowerCase(input)).toBe(expected);
    });
  });

  /**
   * Tests for `mapKindToEnum` - Maps stored string kind to PubkyAppPostKind enum
   */
  describe('mapKindToEnum', () => {
    it.each([
      ['short', PubkyAppPostKind.Short],
      ['long', PubkyAppPostKind.Long],
      ['LONG', PubkyAppPostKind.Long],
      ['collection', PubkyAppPostKind.Collection],
      ['6', PubkyAppPostKind.Collection],
      ['unknown', PubkyAppPostKind.Short], // defaults to Short
    ])('should map "%s" to correct enum', (input, expected) => {
      expect(PostNormalizer.mapKindToEnum(input)).toBe(expected);
    });
  });

  /**
   * Tests for `to` method - Creates PostResult
   */
  describe('to', () => {
    describe('Unit Tests', () => {
      let mockBuilder: ReturnType<typeof createMockBuilder>;

      beforeEach(() => {
        mockBuilder = createMockBuilder();
        setupUnitTestMocks(mockBuilder);
      });

      afterEach(restoreMocks);

      describe('successful creation', () => {
        it('should create post successfully', async () => {
          const post = createBasicPost();
          const result = await PostNormalizer.to(post, TEST_PUBKY.USER_1);

          expect(result).toHaveProperty('post');
          expect(result).toHaveProperty('meta');
        });

        it('should call PubkySpecsSingleton.get with pubky and createPost with content/kind', async () => {
          const post = createBasicPost();
          await PostNormalizer.to(post, TEST_PUBKY.USER_1);

          expect(PubkySpecsSingleton.get).toHaveBeenCalledWith(TEST_PUBKY.USER_1);
          expect(mockBuilder.createPost).toHaveBeenCalledWith(post.content, post.kind, null, null, null);
        });
      });

      describe('different post kinds', () => {
        it.each([
          ['Short', PubkyAppPostKind.Short],
          ['Long', PubkyAppPostKind.Long],
        ])('should handle %s post kind', async (_, kind) => {
          const post = createBasicPost({ kind });
          await PostNormalizer.to(post, TEST_PUBKY.USER_1);

          expect(mockBuilder.createPost).toHaveBeenCalledWith(expect.any(String), kind, null, null, null);
        });
      });

      describe('parent URI handling', () => {
        it('should pass parentUri to createPost when provided', async () => {
          const parentUri = buildPubkyUri(TEST_PUBKY.USER_2, 'posts/parent123');
          const post = createBasicPost({ parentUri });

          await PostNormalizer.to(post, TEST_PUBKY.USER_1);

          expect(mockBuilder.createPost).toHaveBeenCalledWith(post.content, post.kind, parentUri, null, null);
        });

        it('should pass null when parentUri not provided', async () => {
          const post = createBasicPost();
          await PostNormalizer.to(post, TEST_PUBKY.USER_1);

          expect(mockBuilder.createPost).toHaveBeenCalledWith(post.content, post.kind, null, null, null);
        });
      });

      describe('embed handling', () => {
        const embedUri = buildPubkyUri(TEST_PUBKY.USER_2, 'posts/embedded123');
        const embeddedPostId = `${TEST_PUBKY.USER_2}:embedded123`;

        it('should create embed object when embed post exists', async () => {
          (await spyOnBuildCompositeIdFromPubkyUri()).mockReturnValue(embeddedPostId);
          vi.spyOn(PostDetailsModel, 'findById').mockResolvedValue(createMockPostDetails(embeddedPostId));

          const post = createBasicPost({ embed: embedUri });
          await PostNormalizer.to(post, TEST_PUBKY.USER_1);

          expect(mockBuilder.createPost).toHaveBeenCalledWith(
            post.content,
            post.kind,
            null,
            expect.any(PubkyAppPostEmbed),
            null,
          );
        });

        it('should pass null embed when URI is invalid', async () => {
          (await spyOnBuildCompositeIdFromPubkyUri()).mockReturnValue(null);

          const post = createBasicPost({ embed: embedUri });
          await PostNormalizer.to(post, TEST_PUBKY.USER_1);

          expect(mockBuilder.createPost).toHaveBeenCalledWith(post.content, post.kind, null, null, null);
        });

        it('should pass null embed when embedded post not found', async () => {
          (await spyOnBuildCompositeIdFromPubkyUri()).mockReturnValue(embeddedPostId);
          vi.spyOn(PostDetailsModel, 'findById').mockResolvedValue(null);

          const post = createBasicPost({ embed: embedUri });
          await PostNormalizer.to(post, TEST_PUBKY.USER_1);

          expect(mockBuilder.createPost).toHaveBeenCalledWith(post.content, post.kind, null, null, null);
        });
      });

      describe('attachments handling', () => {
        it('should map attachments to file URLs', async () => {
          const attachments = [createMockAttachment('file1'), createMockAttachment('file2')];
          const post = createBasicPost({ attachments });

          await PostNormalizer.to(post, TEST_PUBKY.USER_1);

          expect(mockBuilder.createPost).toHaveBeenCalledWith(post.content, post.kind, null, null, [
            buildPubkyUri(TEST_PUBKY.USER_1, 'files/file1'),
            buildPubkyUri(TEST_PUBKY.USER_1, 'files/file2'),
          ]);
        });

        it('should pass null when no attachments', async () => {
          const post = createBasicPost();
          await PostNormalizer.to(post, TEST_PUBKY.USER_1);

          expect(mockBuilder.createPost).toHaveBeenCalledWith(post.content, post.kind, null, null, null);
        });
      });

      describe('all options combined', () => {
        it('should handle post with all options', async () => {
          const parentUri = buildPubkyUri(TEST_PUBKY.USER_2, 'posts/parent');
          const embedUri = buildPubkyUri(TEST_PUBKY.USER_2, 'posts/embed');
          const embeddedPostId = `${TEST_PUBKY.USER_2}:embed`;

          (await spyOnBuildCompositeIdFromPubkyUri()).mockReturnValue(embeddedPostId);
          vi.spyOn(PostDetailsModel, 'findById').mockResolvedValue(createMockPostDetails(embeddedPostId));

          const post = createBasicPost({
            parentUri,
            embed: embedUri,
            attachments: [createMockAttachment('file1')],
          });

          await PostNormalizer.to(post, TEST_PUBKY.USER_1);

          expect(mockBuilder.createPost).toHaveBeenCalledWith(
            post.content,
            post.kind,
            parentUri,
            expect.any(PubkyAppPostEmbed),
            [buildPubkyUri(TEST_PUBKY.USER_1, 'files/file1')],
          );
        });
      });

      describe('error handling', () => {
        it.each([
          [
            'buildCompositeIdFromPubkyUri',
            async () =>
              (await spyOnBuildCompositeIdFromPubkyUri()).mockImplementation((_params) => {
                throw new Error('URI error');
              }),
          ],
          [
            'createPost',
            () =>
              mockBuilder.createPost.mockImplementation(() => {
                throw new Error('Builder error');
              }),
          ],
        ])('should propagate errors from %s', async (_, setupError) => {
          await setupError();
          const post = createBasicPost({ embed: 'pubky://embed' });

          await expect(PostNormalizer.to(post, TEST_PUBKY.USER_1)).rejects.toThrow();
        });

        it('should propagate errors from PostDetailsModel.findById', async () => {
          (await spyOnBuildCompositeIdFromPubkyUri()).mockReturnValue('valid-id');
          vi.spyOn(PostDetailsModel, 'findById').mockRejectedValue(new Error('Database error'));

          const post = createBasicPost({ embed: 'pubky://embed' });

          await expect(PostNormalizer.to(post, TEST_PUBKY.USER_1)).rejects.toThrow('Database error');
        });

        it('should not call logger when error occurs', async () => {
          mockBuilder.createPost.mockImplementation(() => {
            throw new Error('Error');
          });

          await expect(PostNormalizer.to(createBasicPost(), TEST_PUBKY.USER_1)).rejects.toThrow();
          expect(Logger.debug).not.toHaveBeenCalled();
        });
      });
    });

    describe('Integration Tests', () => {
      beforeEach(setupIntegrationTestMocks);
      afterEach(restoreMocks);

      describe('successful creation with real library', () => {
        it('should create valid result with correct URL format', async () => {
          const post = createBasicPost();
          const result = await PostNormalizer.to(post, TEST_PUBKY.USER_1);

          expect(result.post).toBeDefined();
          expect(result.meta.url).toMatch(/^pubky:\/\/.+\/pub\/pubky\.app\/posts\/.+/);
        });

        it.each([
          ['Short', PubkyAppPostKind.Short],
          ['Long', PubkyAppPostKind.Long],
        ])('should handle %s post kind', async (_, kind) => {
          const post = createBasicPost({ kind });
          const result = await PostNormalizer.to(post, TEST_PUBKY.USER_1);

          expect(result).toBeDefined();
          expect(result.meta.url).toContain('pubky://');
        });

        it('should create post with parent URI', async () => {
          const parentUri = buildPubkyUri(TEST_PUBKY.USER_2, `posts/${TEST_POST_IDS.POST_2}`);
          const post = createBasicPost({ parentUri });

          const result = await PostNormalizer.to(post, TEST_PUBKY.USER_1);

          expect(result).toBeDefined();
        });

        it('should produce valid JSON from post object', async () => {
          const post = createBasicPost();
          const result = await PostNormalizer.to(post, TEST_PUBKY.USER_1);

          expect(typeof result.post.toJson).toBe('function');
          const postJson = result.post.toJson();
          expect(postJson).toHaveProperty('content', post.content);
        });
      });

      describe('validation with real library', () => {
        /**
         * Note: The pubky-app-specs library requires content, embed, or attachments.
         * Empty content alone is not allowed.
         */
        it('should reject empty content without embed or attachments', async () => {
          const post = createBasicPost({ content: '' });

          await expect(PostNormalizer.to(post, TEST_PUBKY.USER_1)).rejects.toThrow(
            'Post must have content, an embed, or attachments',
          );
        });

        it('should throw error for null content', async () => {
          const post = createBasicPost({ content: asInvalid<string>(null) });

          await expect(PostNormalizer.to(post, TEST_PUBKY.USER_1)).rejects.toThrow();
        });
      });

      describe('content length stress tests', () => {
        it('should handle moderate length Short post (2000 characters)', async () => {
          const moderateContent = 'A'.repeat(2000);
          const post = createBasicPost({ content: moderateContent, kind: PubkyAppPostKind.Short });
          const result = await PostNormalizer.to(post, TEST_PUBKY.USER_1);

          expect(result).toBeDefined();
          expect(result.post.toJson().content).toBe(moderateContent);
        });

        /**
         * Note: The pubky-app-specs library validates max length and throws an error
         * when content exceeds the limit for the post kind.
         */
        it('should reject Short post exceeding max length (2000 characters)', async () => {
          const longContent = 'B'.repeat(10_000);
          const post = createBasicPost({ content: longContent, kind: PubkyAppPostKind.Short });

          await expect(PostNormalizer.to(post, TEST_PUBKY.USER_1)).rejects.toThrow(
            'Post content exceeds maximum length for Short kind',
          );
        });

        /**
         * Note: pubky-app-specs counts emoji units as 1 character, unlike how JavaScript counts string length.
         */
        it('should accept Short post with unicode characters at the limit', async () => {
          const unicodeContent = '🎉'.repeat(2000); // 4,000 string length but 2,000 emoji units
          const post = createBasicPost({ content: unicodeContent, kind: PubkyAppPostKind.Short });
          const result = await PostNormalizer.to(post, TEST_PUBKY.USER_1);

          expect(result).toBeDefined();
          const returnedContent = result.post.toJson().content;
          expect(returnedContent.length).toBe(4000);
          expect(returnedContent).toBe('🎉'.repeat(2000));
        });

        it('should handle very long Long post (10,000 characters)', async () => {
          const longContent = 'E'.repeat(10_000);
          const post = createBasicPost({ content: longContent, kind: PubkyAppPostKind.Long });
          const result = await PostNormalizer.to(post, TEST_PUBKY.USER_1);

          expect(result).toBeDefined();
          expect(result.post.toJson().content).toBe(longContent);
        });

        /**
         * Note: The pubky-app-specs library validates max length and throws an error
         * when content exceeds the limit for Long posts (50,000 characters).
         */
        it('should reject Long post exceeding max length (50,000 characters)', async () => {
          const extremelyLongContent = 'F'.repeat(100_000);
          const post = createBasicPost({ content: extremelyLongContent, kind: PubkyAppPostKind.Long });

          await expect(PostNormalizer.to(post, TEST_PUBKY.USER_1)).rejects.toThrow(
            'Post content exceeds maximum length for Long kind',
          );
        });

        /**
         * Note: pubky-app-specs counts emoji units as 1 character, unlike how JavaScript counts string length.
         */
        it('should accept Long post with unicode characters within limit', async () => {
          const unicodeContent = '🚀'.repeat(30_000); // 60,000 string length but 30,000 emoji units
          const post = createBasicPost({ content: unicodeContent, kind: PubkyAppPostKind.Long });
          const result = await PostNormalizer.to(post, TEST_PUBKY.USER_1);

          expect(result).toBeDefined();
          const returnedContent = result.post.toJson().content;
          expect(returnedContent.length).toBe(60_000);
          expect(returnedContent).toBe('🚀'.repeat(30_000));
        });
      });
    });
  });

  describe('toCollection', () => {
    let mockBuilder: ReturnType<typeof createMockBuilder>;

    beforeEach(() => {
      mockBuilder = createMockBuilder();
      setupUnitTestMocks(mockBuilder);
    });

    afterEach(restoreMocks);

    it('creates a collection post through pubky-app-specs', async () => {
      await PostNormalizer.toCollection(
        {
          name: 'Proof of Work',
          description: 'Bitcoin writing',
          items: [buildPubkyUri(TEST_PUBKY.USER_2, 'posts/post-1')],
        },
        TEST_PUBKY.USER_1,
      );

      expect(PubkySpecsSingleton.get).toHaveBeenCalledWith(TEST_PUBKY.USER_1);
      expect(mockBuilder.createCollectionPost).toHaveBeenCalledWith(
        'Proof of Work',
        'Bitcoin writing',
        [buildPubkyUri(TEST_PUBKY.USER_2, 'posts/post-1')],
        undefined,
        COLLECTION_LAYOUT.GRID,
      );
    });

    it('forwards an optional cover_image URL to pubky-app-specs', async () => {
      await PostNormalizer.toCollection(
        {
          name: 'Proof of Work',
          coverImage: 'https://cdn.example.com/cover.png',
          layout: COLLECTION_LAYOUT.LIST,
        },
        TEST_PUBKY.USER_1,
      );

      expect(mockBuilder.createCollectionPost).toHaveBeenCalledWith(
        'Proof of Work',
        '',
        [],
        'https://cdn.example.com/cover.png',
        COLLECTION_LAYOUT.LIST,
      );
    });

    it('forwards the Visual layout to pubky-app-specs', async () => {
      await PostNormalizer.toCollection(
        {
          name: 'Gallery',
          layout: COLLECTION_LAYOUT.VISUAL,
        },
        TEST_PUBKY.USER_1,
      );

      expect(mockBuilder.createCollectionPost).toHaveBeenCalledWith(
        'Gallery',
        '',
        [],
        undefined,
        COLLECTION_LAYOUT.VISUAL,
      );
    });

    it('validates the collection envelope before calling specs', async () => {
      await expect(
        PostNormalizer.toCollection(
          {
            name: '   ',
            description: 'No name',
          },
          TEST_PUBKY.USER_1,
        ),
      ).rejects.toThrow('Collection name is required');

      expect(mockBuilder.createCollectionPost).not.toHaveBeenCalled();
    });
  });

  /**
   * Tests for `toEdit` method - Edits existing post content
   */
  describe('toEdit', () => {
    const compositePostId = `${TEST_PUBKY.USER_1}:${TEST_POST_IDS.POST_1}`;

    const createMockPostRelationships = (
      overrides?: Partial<PostRelationshipsModelSchema>,
    ): PostRelationshipsModelSchema => ({
      id: compositePostId,
      replied: null,
      reposted: null,
      mentioned: [],
      ...overrides,
    });

    const createMockEditBuilder = (
      overrides?: Partial<{ editPost: ReturnType<typeof vi.fn>; createPost: ReturnType<typeof vi.fn> }>,
    ) => ({
      editPost: vi.fn((originalPost: PubkyAppPost, postId: string, newContent: string) =>
        asOpaque<PostResult>({
          post: {
            content: newContent,
            kind: originalPost.kind,
            parent: originalPost.parent,
            embed: originalPost.embed,
            attachments: originalPost.attachments,
            toJson: vi.fn(() => ({
              content: newContent,
              kind: originalPost.kind,
            })),
          },
          meta: {
            id: postId,
            url: buildPubkyUri(TEST_PUBKY.USER_1, `posts/${postId}`),
            path: `/pub/pubky.app/posts/${postId}`,
          },
        }),
      ),
      createPost: vi.fn(),
      ...overrides,
    });

    describe('Unit Tests', () => {
      let mockBuilder: ReturnType<typeof createMockEditBuilder>;

      beforeEach(() => {
        mockBuilder = createMockEditBuilder();
        setupUnitTestMocks(mockBuilder);
      });

      afterEach(restoreMocks);

      it('should edit post with correct arguments', async () => {
        const mockPostDetails = createMockPostDetails(compositePostId);
        mockPostDetails.content = 'Original content';
        mockPostDetails.attachments = ['pubky://attachment1'];

        vi.spyOn(PostDetailsModel, 'findById').mockResolvedValue(mockPostDetails);
        vi.spyOn(PostRelationshipsModel, 'findById').mockResolvedValue(createMockPostRelationships());

        const newContent = 'Updated content';
        const result = await PostNormalizer.toEdit({
          compositePostId,
          content: newContent,
          currentUserPubky: TEST_PUBKY.USER_1,
        });

        expect(result).toHaveProperty('post');
        expect(result).toHaveProperty('meta');
        expect(mockBuilder.editPost).toHaveBeenCalledWith(expect.any(PubkyAppPost), TEST_POST_IDS.POST_1, newContent);

        // Verify original post data is preserved
        const originalPostArg = mockBuilder.editPost.mock.calls[0][0] as PubkyAppPost;
        expect(originalPostArg.content).toBe('Original content');
        expect(originalPostArg.attachments).toEqual(['pubky://attachment1']);
      });

      it('should throw error when current user is not the author', async () => {
        await expect(
          PostNormalizer.toEdit({
            compositePostId,
            content: 'New content',
            currentUserPubky: TEST_PUBKY.USER_2, // Different user
          }),
        ).rejects.toThrow('Current user is not the author of this post');
      });

      it('should throw POST_NOT_FOUND when post does not exist', async () => {
        vi.spyOn(PostDetailsModel, 'findById').mockResolvedValue(null);

        await expect(
          PostNormalizer.toEdit({
            compositePostId,
            content: 'New content',
            currentUserPubky: TEST_PUBKY.USER_1,
          }),
        ).rejects.toThrow('Post not found');
      });

      it('should throw POST_NOT_FOUND when the post is tombstoned (content === [DELETED])', async () => {
        // Regression: pre-tombstone refactor `!postDetails` caught hard-deleted
        // rows. Now they stick around as tombstones — without the content
        // check, `toEdit` would try to build a `PubkyAppPost` whose content is
        // the `[DELETED]` sentinel.
        vi.spyOn(PostDetailsModel, 'findById').mockResolvedValue(
          asOpaque<PostDetailsModel>({ ...createMockPostDetails(compositePostId), content: '[DELETED]' }),
        );

        await expect(
          PostNormalizer.toEdit({
            compositePostId,
            content: 'New content',
            currentUserPubky: TEST_PUBKY.USER_1,
          }),
        ).rejects.toThrow('Post not found');
      });

      it('should preserve parent URI for reply posts', async () => {
        const parentUri = buildPubkyUri(TEST_PUBKY.USER_2, `posts/${TEST_POST_IDS.POST_2}`);

        vi.spyOn(PostDetailsModel, 'findById').mockResolvedValue(createMockPostDetails(compositePostId));
        vi.spyOn(PostRelationshipsModel, 'findById').mockResolvedValue(
          createMockPostRelationships({ replied: parentUri }),
        );

        await PostNormalizer.toEdit({
          compositePostId,
          content: 'Updated reply',
          currentUserPubky: TEST_PUBKY.USER_1,
        });

        const originalPostArg = mockBuilder.editPost.mock.calls[0][0] as PubkyAppPost;
        expect(originalPostArg.parent).toBe(parentUri);
      });

      it('should reconstruct embed for repost/quote', async () => {
        const repostedUri = buildPubkyUri(TEST_PUBKY.USER_2, `posts/${TEST_POST_IDS.POST_2}`);
        const embeddedPostId = `${TEST_PUBKY.USER_2}:${TEST_POST_IDS.POST_2}`;

        vi.spyOn(PostDetailsModel, 'findById').mockImplementation(async (id) => {
          if (id === compositePostId) return createMockPostDetails(compositePostId);
          if (id === embeddedPostId) return createMockPostDetails(embeddedPostId, 'short');
          return null;
        });
        vi.spyOn(PostRelationshipsModel, 'findById').mockResolvedValue(
          createMockPostRelationships({ reposted: repostedUri }),
        );
        (await spyOnBuildCompositeIdFromPubkyUri()).mockReturnValue(embeddedPostId);

        await PostNormalizer.toEdit({
          compositePostId,
          content: 'Updated quote',
          currentUserPubky: TEST_PUBKY.USER_1,
        });

        const originalPostArg = mockBuilder.editPost.mock.calls[0][0] as PubkyAppPost;
        expect(originalPostArg.embed).toBeDefined();
      });

      it('should propagate database errors', async () => {
        vi.spyOn(PostDetailsModel, 'findById').mockRejectedValue(new Error('Database error'));

        await expect(
          PostNormalizer.toEdit({
            compositePostId,
            content: 'New content',
            currentUserPubky: TEST_PUBKY.USER_1,
          }),
        ).rejects.toThrow('Database error');
      });
    });

    describe('Integration Tests', () => {
      beforeEach(setupIntegrationTestMocks);
      afterEach(restoreMocks);

      it('should edit post and return valid result with new content', async () => {
        vi.spyOn(PostDetailsModel, 'findById').mockResolvedValue(createMockPostDetails(compositePostId));
        vi.spyOn(PostRelationshipsModel, 'findById').mockResolvedValue(createMockPostRelationships());

        const newContent = 'Updated post content';
        const result = await PostNormalizer.toEdit({
          compositePostId,
          content: newContent,
          currentUserPubky: TEST_PUBKY.USER_1,
        });

        expect(result.post).toBeDefined();
        expect(result.meta.url).toMatch(/^pubky:\/\/.+\/pub\/pubky\.app\/posts\/.+/);
        expect(result.meta.id).toBe(TEST_POST_IDS.POST_1);
        expect(result.post.toJson().content).toBe(newContent);
      });

      it('should reject empty content', async () => {
        vi.spyOn(PostDetailsModel, 'findById').mockResolvedValue(createMockPostDetails(compositePostId));
        vi.spyOn(PostRelationshipsModel, 'findById').mockResolvedValue(createMockPostRelationships());

        await expect(
          PostNormalizer.toEdit({
            compositePostId,
            content: '',
            currentUserPubky: TEST_PUBKY.USER_1,
          }),
        ).rejects.toThrow();
      });

      it('should handle Long posts with extended content length', async () => {
        vi.spyOn(PostDetailsModel, 'findById').mockResolvedValue(createMockPostDetails(compositePostId, 'long'));
        vi.spyOn(PostRelationshipsModel, 'findById').mockResolvedValue(createMockPostRelationships());

        const longContent = 'E'.repeat(10_000);
        const result = await PostNormalizer.toEdit({
          compositePostId,
          content: longContent,
          currentUserPubky: TEST_PUBKY.USER_1,
        });

        expect(result).toBeDefined();
        expect(result.post.toJson().content).toBe(longContent);
      });
    });
  });
});
