import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as Core from '@/core';
import * as Libs from '@/libs';
import { PubkyAppPostKind, PostResult, PubkyAppPostEmbed, PubkyAppPost } from 'pubky-app-specs';
import type { FileResult } from 'pubky-app-specs';
import { asInvalid, asOpaque } from '@/test-utils';
import {
  TEST_PUBKY,
  TEST_POST_IDS,
  setupUnitTestMocks,
  setupIntegrationTestMocks,
  restoreMocks,
  buildPubkyUri,
} from '../pipes.test-utils';

describe('PostNormalizer', () => {
  // Test data factories
  const createBasicPost = (overrides?: Partial<Core.PostValidatorData>): Core.PostValidatorData => ({
    content: 'Hello, world!',
    kind: PubkyAppPostKind.Short,
    ...overrides,
  });

  const createMockFileResult = (id: string): FileResult =>
    asOpaque<FileResult>({
      file: { toJson: vi.fn(() => ({ id, src: `blob-${id}`, content_type: 'image/png', size: 1024 })) },
      meta: { url: buildPubkyUri(TEST_PUBKY.USER_1, `files/${id}`) },
    });

  const createMockAttachment = (id: string): Core.TFileAttachmentResult => ({
    blobResult: asOpaque<Core.TFileAttachmentResult['blobResult']>({
      blob: { data: new Uint8Array([1, 2, 3]) },
      meta: { url: buildPubkyUri(TEST_PUBKY.USER_1, `blobs/${id}`) },
    }),
    fileResult: createMockFileResult(id),
  });

  const createMockPostDetails = (id: string, kind = 'short'): Core.PostDetailsModelSchema => ({
    id,
    content: 'Mock content',
    kind,
    uri: buildPubkyUri(TEST_PUBKY.USER_1, `posts/${id}`),
    indexed_at: Date.now(),
    attachments: null,
  });

  const createMockBuilder = (overrides?: Partial<{ createPost: ReturnType<typeof vi.fn> }>) => ({
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
      expect(Core.PostNormalizer.postKindToLowerCase(input)).toBe(expected);
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
      ['unknown', PubkyAppPostKind.Short], // defaults to Short
    ])('should map "%s" to correct enum', (input, expected) => {
      expect(Core.PostNormalizer.mapKindToEnum(input)).toBe(expected);
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
          const result = await Core.PostNormalizer.to(post, TEST_PUBKY.USER_1);

          expect(result).toHaveProperty('post');
          expect(result).toHaveProperty('meta');
        });

        it('should call PubkySpecsSingleton.get with pubky and createPost with content/kind', async () => {
          const post = createBasicPost();
          await Core.PostNormalizer.to(post, TEST_PUBKY.USER_1);

          expect(Core.PubkySpecsSingleton.get).toHaveBeenCalledWith(TEST_PUBKY.USER_1);
          expect(mockBuilder.createPost).toHaveBeenCalledWith(post.content, post.kind, null, null, null);
        });
      });

      describe('different post kinds', () => {
        it.each([
          ['Short', PubkyAppPostKind.Short],
          ['Long', PubkyAppPostKind.Long],
        ])('should handle %s post kind', async (_, kind) => {
          const post = createBasicPost({ kind });
          await Core.PostNormalizer.to(post, TEST_PUBKY.USER_1);

          expect(mockBuilder.createPost).toHaveBeenCalledWith(expect.any(String), kind, null, null, null);
        });
      });

      describe('parent URI handling', () => {
        it('should pass parentUri to createPost when provided', async () => {
          const parentUri = buildPubkyUri(TEST_PUBKY.USER_2, 'posts/parent123');
          const post = createBasicPost({ parentUri });

          await Core.PostNormalizer.to(post, TEST_PUBKY.USER_1);

          expect(mockBuilder.createPost).toHaveBeenCalledWith(post.content, post.kind, parentUri, null, null);
        });

        it('should pass null when parentUri not provided', async () => {
          const post = createBasicPost();
          await Core.PostNormalizer.to(post, TEST_PUBKY.USER_1);

          expect(mockBuilder.createPost).toHaveBeenCalledWith(post.content, post.kind, null, null, null);
        });
      });

      describe('embed handling', () => {
        const embedUri = buildPubkyUri(TEST_PUBKY.USER_2, 'posts/embedded123');
        const embeddedPostId = `${TEST_PUBKY.USER_2}:embedded123`;

        it('should create embed object when embed post exists', async () => {
          vi.spyOn(Core, 'buildCompositeIdFromPubkyUri').mockReturnValue(embeddedPostId);
          vi.spyOn(Core.PostDetailsModel, 'findById').mockResolvedValue(createMockPostDetails(embeddedPostId));

          const post = createBasicPost({ embed: embedUri });
          await Core.PostNormalizer.to(post, TEST_PUBKY.USER_1);

          expect(mockBuilder.createPost).toHaveBeenCalledWith(
            post.content,
            post.kind,
            null,
            expect.any(PubkyAppPostEmbed),
            null,
          );
        });

        it('should pass null embed when URI is invalid', async () => {
          vi.spyOn(Core, 'buildCompositeIdFromPubkyUri').mockReturnValue(null);

          const post = createBasicPost({ embed: embedUri });
          await Core.PostNormalizer.to(post, TEST_PUBKY.USER_1);

          expect(mockBuilder.createPost).toHaveBeenCalledWith(post.content, post.kind, null, null, null);
        });

        it('should pass null embed when embedded post not found', async () => {
          vi.spyOn(Core, 'buildCompositeIdFromPubkyUri').mockReturnValue(embeddedPostId);
          vi.spyOn(Core.PostDetailsModel, 'findById').mockResolvedValue(null);

          const post = createBasicPost({ embed: embedUri });
          await Core.PostNormalizer.to(post, TEST_PUBKY.USER_1);

          expect(mockBuilder.createPost).toHaveBeenCalledWith(post.content, post.kind, null, null, null);
        });
      });

      describe('attachments handling', () => {
        it('should map attachments to file URLs', async () => {
          const attachments = [createMockAttachment('file1'), createMockAttachment('file2')];
          const post = createBasicPost({ attachments });

          await Core.PostNormalizer.to(post, TEST_PUBKY.USER_1);

          expect(mockBuilder.createPost).toHaveBeenCalledWith(post.content, post.kind, null, null, [
            buildPubkyUri(TEST_PUBKY.USER_1, 'files/file1'),
            buildPubkyUri(TEST_PUBKY.USER_1, 'files/file2'),
          ]);
        });

        it('should pass null when no attachments', async () => {
          const post = createBasicPost();
          await Core.PostNormalizer.to(post, TEST_PUBKY.USER_1);

          expect(mockBuilder.createPost).toHaveBeenCalledWith(post.content, post.kind, null, null, null);
        });
      });

      describe('all options combined', () => {
        it('should handle post with all options', async () => {
          const parentUri = buildPubkyUri(TEST_PUBKY.USER_2, 'posts/parent');
          const embedUri = buildPubkyUri(TEST_PUBKY.USER_2, 'posts/embed');
          const embeddedPostId = `${TEST_PUBKY.USER_2}:embed`;

          vi.spyOn(Core, 'buildCompositeIdFromPubkyUri').mockReturnValue(embeddedPostId);
          vi.spyOn(Core.PostDetailsModel, 'findById').mockResolvedValue(createMockPostDetails(embeddedPostId));

          const post = createBasicPost({
            parentUri,
            embed: embedUri,
            attachments: [createMockAttachment('file1')],
          });

          await Core.PostNormalizer.to(post, TEST_PUBKY.USER_1);

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
            () =>
              vi.spyOn(Core, 'buildCompositeIdFromPubkyUri').mockImplementation((_params) => {
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
          setupError();
          const post = createBasicPost({ embed: 'pubky://embed' });

          await expect(Core.PostNormalizer.to(post, TEST_PUBKY.USER_1)).rejects.toThrow();
        });

        it('should propagate errors from PostDetailsModel.findById', async () => {
          vi.spyOn(Core, 'buildCompositeIdFromPubkyUri').mockReturnValue('valid-id');
          vi.spyOn(Core.PostDetailsModel, 'findById').mockRejectedValue(new Error('Database error'));

          const post = createBasicPost({ embed: 'pubky://embed' });

          await expect(Core.PostNormalizer.to(post, TEST_PUBKY.USER_1)).rejects.toThrow('Database error');
        });

        it('should not call logger when error occurs', async () => {
          mockBuilder.createPost.mockImplementation(() => {
            throw new Error('Error');
          });

          await expect(Core.PostNormalizer.to(createBasicPost(), TEST_PUBKY.USER_1)).rejects.toThrow();
          expect(Libs.Logger.debug).not.toHaveBeenCalled();
        });
      });
    });

    describe('Integration Tests', () => {
      beforeEach(setupIntegrationTestMocks);
      afterEach(restoreMocks);

      describe('successful creation with real library', () => {
        it('should create valid result with correct URL format', async () => {
          const post = createBasicPost();
          const result = await Core.PostNormalizer.to(post, TEST_PUBKY.USER_1);

          expect(result.post).toBeDefined();
          expect(result.meta.url).toMatch(/^pubky:\/\/.+\/pub\/pubky\.app\/posts\/.+/);
        });

        it.each([
          ['Short', PubkyAppPostKind.Short],
          ['Long', PubkyAppPostKind.Long],
        ])('should handle %s post kind', async (_, kind) => {
          const post = createBasicPost({ kind });
          const result = await Core.PostNormalizer.to(post, TEST_PUBKY.USER_1);

          expect(result).toBeDefined();
          expect(result.meta.url).toContain('pubky://');
        });

        it('should create post with parent URI', async () => {
          const parentUri = buildPubkyUri(TEST_PUBKY.USER_2, `posts/${TEST_POST_IDS.POST_2}`);
          const post = createBasicPost({ parentUri });

          const result = await Core.PostNormalizer.to(post, TEST_PUBKY.USER_1);

          expect(result).toBeDefined();
        });

        it('should produce valid JSON from post object', async () => {
          const post = createBasicPost();
          const result = await Core.PostNormalizer.to(post, TEST_PUBKY.USER_1);

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

          await expect(Core.PostNormalizer.to(post, TEST_PUBKY.USER_1)).rejects.toThrow(
            'Post must have content, an embed, or attachments',
          );
        });

        it('should throw error for null content', async () => {
          const post = createBasicPost({ content: asInvalid<string>(null) });

          await expect(Core.PostNormalizer.to(post, TEST_PUBKY.USER_1)).rejects.toThrow();
        });
      });

      describe('content length stress tests', () => {
        it('should handle moderate length Short post (2000 characters)', async () => {
          const moderateContent = 'A'.repeat(2000);
          const post = createBasicPost({ content: moderateContent, kind: PubkyAppPostKind.Short });
          const result = await Core.PostNormalizer.to(post, TEST_PUBKY.USER_1);

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

          await expect(Core.PostNormalizer.to(post, TEST_PUBKY.USER_1)).rejects.toThrow(
            'Post content exceeds maximum length for Short kind',
          );
        });

        /**
         * Note: pubky-app-specs counts emoji units as 1 character, unlike how JavaScript counts string length.
         */
        it('should accept Short post with unicode characters at the limit', async () => {
          const unicodeContent = '🎉'.repeat(2000); // 4,000 string length but 2,000 emoji units
          const post = createBasicPost({ content: unicodeContent, kind: PubkyAppPostKind.Short });
          const result = await Core.PostNormalizer.to(post, TEST_PUBKY.USER_1);

          expect(result).toBeDefined();
          const returnedContent = result.post.toJson().content;
          expect(returnedContent.length).toBe(4000);
          expect(returnedContent).toBe('🎉'.repeat(2000));
        });

        it('should handle very long Long post (10,000 characters)', async () => {
          const longContent = 'E'.repeat(10_000);
          const post = createBasicPost({ content: longContent, kind: PubkyAppPostKind.Long });
          const result = await Core.PostNormalizer.to(post, TEST_PUBKY.USER_1);

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

          await expect(Core.PostNormalizer.to(post, TEST_PUBKY.USER_1)).rejects.toThrow(
            'Post content exceeds maximum length for Long kind',
          );
        });

        /**
         * Note: pubky-app-specs counts emoji units as 1 character, unlike how JavaScript counts string length.
         */
        it('should accept Long post with unicode characters within limit', async () => {
          const unicodeContent = '🚀'.repeat(30_000); // 60,000 string length but 30,000 emoji units
          const post = createBasicPost({ content: unicodeContent, kind: PubkyAppPostKind.Long });
          const result = await Core.PostNormalizer.to(post, TEST_PUBKY.USER_1);

          expect(result).toBeDefined();
          const returnedContent = result.post.toJson().content;
          expect(returnedContent.length).toBe(60_000);
          expect(returnedContent).toBe('🚀'.repeat(30_000));
        });
      });
    });
  });

  /**
   * Tests for `toEdit` method - Edits existing post content
   */
  describe('toEdit', () => {
    const compositePostId = `${TEST_PUBKY.USER_1}:${TEST_POST_IDS.POST_1}`;

    const createMockPostRelationships = (
      overrides?: Partial<Core.PostRelationshipsModelSchema>,
    ): Core.PostRelationshipsModelSchema => ({
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

        vi.spyOn(Core.PostDetailsModel, 'findById').mockResolvedValue(mockPostDetails);
        vi.spyOn(Core.PostRelationshipsModel, 'findById').mockResolvedValue(createMockPostRelationships());

        const newContent = 'Updated content';
        const result = await Core.PostNormalizer.toEdit({
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
          Core.PostNormalizer.toEdit({
            compositePostId,
            content: 'New content',
            currentUserPubky: TEST_PUBKY.USER_2, // Different user
          }),
        ).rejects.toThrow('Current user is not the author of this post');
      });

      it('should throw POST_NOT_FOUND when post does not exist', async () => {
        vi.spyOn(Core.PostDetailsModel, 'findById').mockResolvedValue(null);

        await expect(
          Core.PostNormalizer.toEdit({
            compositePostId,
            content: 'New content',
            currentUserPubky: TEST_PUBKY.USER_1,
          }),
        ).rejects.toThrow('Post not found');
      });

      it('should preserve parent URI for reply posts', async () => {
        const parentUri = buildPubkyUri(TEST_PUBKY.USER_2, `posts/${TEST_POST_IDS.POST_2}`);

        vi.spyOn(Core.PostDetailsModel, 'findById').mockResolvedValue(createMockPostDetails(compositePostId));
        vi.spyOn(Core.PostRelationshipsModel, 'findById').mockResolvedValue(
          createMockPostRelationships({ replied: parentUri }),
        );

        await Core.PostNormalizer.toEdit({
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

        vi.spyOn(Core.PostDetailsModel, 'findById').mockImplementation(async (id) => {
          if (id === compositePostId) return createMockPostDetails(compositePostId);
          if (id === embeddedPostId) return createMockPostDetails(embeddedPostId, 'short');
          return null;
        });
        vi.spyOn(Core.PostRelationshipsModel, 'findById').mockResolvedValue(
          createMockPostRelationships({ reposted: repostedUri }),
        );
        vi.spyOn(Core, 'buildCompositeIdFromPubkyUri').mockReturnValue(embeddedPostId);

        await Core.PostNormalizer.toEdit({
          compositePostId,
          content: 'Updated quote',
          currentUserPubky: TEST_PUBKY.USER_1,
        });

        const originalPostArg = mockBuilder.editPost.mock.calls[0][0] as PubkyAppPost;
        expect(originalPostArg.embed).toBeDefined();
      });

      it('should propagate database errors', async () => {
        vi.spyOn(Core.PostDetailsModel, 'findById').mockRejectedValue(new Error('Database error'));

        await expect(
          Core.PostNormalizer.toEdit({
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
        vi.spyOn(Core.PostDetailsModel, 'findById').mockResolvedValue(createMockPostDetails(compositePostId));
        vi.spyOn(Core.PostRelationshipsModel, 'findById').mockResolvedValue(createMockPostRelationships());

        const newContent = 'Updated post content';
        const result = await Core.PostNormalizer.toEdit({
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
        vi.spyOn(Core.PostDetailsModel, 'findById').mockResolvedValue(createMockPostDetails(compositePostId));
        vi.spyOn(Core.PostRelationshipsModel, 'findById').mockResolvedValue(createMockPostRelationships());

        await expect(
          Core.PostNormalizer.toEdit({
            compositePostId,
            content: '',
            currentUserPubky: TEST_PUBKY.USER_1,
          }),
        ).rejects.toThrow();
      });

      it('should handle Long posts with extended content length', async () => {
        vi.spyOn(Core.PostDetailsModel, 'findById').mockResolvedValue(createMockPostDetails(compositePostId, 'long'));
        vi.spyOn(Core.PostRelationshipsModel, 'findById').mockResolvedValue(createMockPostRelationships());

        const longContent = 'E'.repeat(10_000);
        const result = await Core.PostNormalizer.toEdit({
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
