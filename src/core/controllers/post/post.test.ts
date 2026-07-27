import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FileApplication } from '@/application/file/file';
import { PostApplication } from '@/application/post/post';
import { COLLECTION_LAYOUT } from '@/config/collections';
import type { TCreatePostParams, TFetchPostTaggersParams } from '@/controllers/post/post.types';
import { db } from '@/database/franky/franky';
import { DatabaseErrorCode, ServerErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { HttpMethod } from '@/libs/http/http.types';
import type { Pubky } from '@/models/models.types';
import { buildCompositeId } from '@/models/models.utils';
import { PostCountsModel } from '@/models/post/counts/postCounts';
import { PostDetailsModel } from '@/models/post/details/postDetails';
import type { PostDetailsModelSchema } from '@/models/post/details/postDetails.schema';
import { PostRelationshipsModel } from '@/models/post/relationships/postRelationships';
import { PostTagsModel } from '@/models/post/tags/postTags';
import type { TFileAttachmentResult } from '@/pipes/file/file.types';
import { PostNormalizer } from '@/pipes/post/post.normalizer';
import { HomeserverService } from '@/services/homeserver/homeserver';
import type { NexusTaggers } from '@/services/nexus/nexus.types';
import { useAuthStore } from '@/stores/auth/auth.store';
import { mockSession } from '@/test-utils/pubky';
import { asOpaque } from '@/test-utils/type-assertions';

// Mock HomeserverService
vi.mock('@/services/homeserver/homeserver', () => ({
  HomeserverService: {
    request: vi.fn(),
  },
}));

// Mock FileApplication
vi.mock('@/application/file/file', () => ({
  FileApplication: {
    upload: vi.fn(),
    delete: vi.fn(),
    toFileAttachment: vi.fn(),
    commitCreate: vi.fn(),
    commitDelete: vi.fn(),
  },
}));

// Mock TagApplication
vi.mock('@/application/tag/tag', () => ({
  TagApplication: {
    create: vi.fn(),
    commitCreate: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock pubky-app-specs
vi.mock('pubky-app-specs', () => ({
  PubkySpecsBuilder: class {
    createPost(content: string, kind: number) {
      const kindMap: Record<number, string> = {
        0: 'short',
        1: 'long',
        2: 'image',
        3: 'video',
        4: 'link',
        5: 'file',
      };
      return {
        post: {
          content,
          kind: kindMap[kind] ?? 'short',
          attachments: null,
          toJson: () => ({ content, kind: kindMap[kind] ?? 'short' }),
        },
        meta: {
          id: 'post123',
          url: `pubky://author/pub/pubky.app/posts/post123`,
        },
      };
    }

    createBlob(blob: Uint8Array) {
      return {
        blob: { data: blob },
        meta: { url: 'pubky://author/pub/pubky.app/blobs/blob123' },
      };
    }

    createFile(name: string, url: string, contentType: string, size: number) {
      return {
        file: {
          toJson: () => ({ name, src: url, content_type: contentType, size }),
        },
        meta: { url: `pubky://author/pub/pubky.app/files/${name}` },
      };
    }

    createTag(uri: string, label: string) {
      return {
        tag: {
          label,
          toJson: () => ({ uri, label }),
        },
        meta: { url: `pubky://author/pub/pubky.app/tags/${label}` },
      };
    }
  },
  PubkyAppPostKind: {
    Short: 0,
    Long: 1,
    Image: 2,
    Video: 3,
    Link: 4,
    File: 5,
  },
  PubkyAppPostEmbed: class {
    constructor(
      public uri: string,
      public content: string,
    ) {}
  },
  postUriBuilder: (authorId: string, postId: string) => `pubky://${authorId}/pub/pubky.app/posts/${postId}`,
}));

// Test data
const testData = {
  authorPubky: 'pxnu33x7jtpx9ar1ytsi4yxbp6a5o36gwhffs8zoxmbuptici1jy' as Pubky,
  postId: 'abc123xyz',
  get fullPostId() {
    return buildCompositeId({ pubky: this.authorPubky, id: this.postId });
  },
};

// Helper functions
const createPostParams = (content: string, parentPostId?: string): TCreatePostParams => ({
  content,
  authorId: testData.authorPubky,
  parentPostId,
});

const setupExistingPost = async () => {
  const postDetails: PostDetailsModelSchema = {
    id: testData.fullPostId,
    content: 'Test post content',
    indexed_at: Date.now(),
    kind: 'short', // PubkyAppPostKind.Short
    uri: `pubky://${testData.authorPubky}/pub/pubky.app/posts/${testData.postId}`,
    attachments: null,
  };

  await PostDetailsModel.table.add(postDetails);
  await PostCountsModel.table.add({
    id: testData.fullPostId,
    tags: 0,
    unique_tags: 0,
    replies: 0,
    reposts: 0,
  });
  await PostRelationshipsModel.table.add({
    id: testData.fullPostId,
    replied: null,
    reposted: null,
    mentioned: [],
  });
};

const setupAuthUser = (pubky: Pubky) => {
  const authStore = useAuthStore.getState();
  authStore.init({
    currentUserPubky: pubky,
    session: mockSession(),
    hasProfile: false,
  });
};

const cleanupAuthUser = () => {
  useAuthStore.getState().reset();
};

// TODO: Refactor the dynamic `await import('./post')` / application-module import.
// pattern in these tests to static top-level imports in a follow-up PR.
describe('PostController', () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    // Mock HomeserverService.request to resolve successfully
    vi.spyOn(HomeserverService, 'request').mockResolvedValue(undefined);
    vi.spyOn(FileApplication, 'commitCreate').mockResolvedValue(undefined);

    // Initialize database and clear tables
    await db.initialize();
    await db.transaction(
      'rw',
      [PostDetailsModel.table, PostCountsModel.table, PostRelationshipsModel.table, PostTagsModel.table],
      async () => {
        await PostDetailsModel.table.clear();
        await PostCountsModel.table.clear();
        await PostRelationshipsModel.table.clear();
        await PostTagsModel.table.clear();
      },
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getDetails', () => {
    it('should return post details when post exists', async () => {
      await setupExistingPost();
      const { PostController } = await import('./post');

      const result = await PostController.getDetails({ compositeId: testData.fullPostId });

      expect(result).toBeDefined();
      expect(result?.id).toBe(testData.fullPostId);
      expect(result?.content).toBe('Test post content');
      expect(result?.kind).toBe('short');
      expect(result?.uri).toBe(`pubky://${testData.authorPubky}/pub/pubky.app/posts/${testData.postId}`);
    });

    it('should return null when post not found', async () => {
      const { PostController } = await import('./post');

      const result = await PostController.getDetails({ compositeId: 'nonexistent:post' });

      expect(result).toBeNull();
    });
  });

  describe('getDetailsByIds', () => {
    it('should return post details aligned to input order with undefined for missing posts', async () => {
      await setupExistingPost();
      const { PostController } = await import('./post');

      const result = await PostController.getDetailsByIds({
        compositeIds: ['nonexistent:post', testData.fullPostId],
      });

      expect(result).toHaveLength(2);
      expect(result[0]).toBeUndefined();
      expect(result[1]?.id).toBe(testData.fullPostId);
    });

    it('should return an empty array when given no ids', async () => {
      const { PostController } = await import('./post');

      const result = await PostController.getDetailsByIds({ compositeIds: [] });

      expect(result).toEqual([]);
    });
  });

  describe('getCounts', () => {
    it('should return post counts when they exist', async () => {
      await setupExistingPost();
      const { PostController } = await import('./post');

      const result = await PostController.getCounts({ compositeId: testData.fullPostId });

      expect(result).toBeDefined();
      expect(result!.id).toBe(testData.fullPostId);
      expect(result!.tags).toBe(0);
      expect(result!.unique_tags).toBe(0);
      expect(result!.replies).toBe(0);
      expect(result!.reposts).toBe(0);
    });

    it('should return null when post not found', async () => {
      const { PostController } = await import('./post');

      const result = await PostController.getCounts({ compositeId: 'nonexistent:post' });

      expect(result).toBeNull();
    });

    it('should include all count fields in response', async () => {
      await setupExistingPost();

      // Update counts to non-zero values
      await PostCountsModel.table.update(testData.fullPostId, {
        tags: 5,
        unique_tags: 3,
        replies: 10,
        reposts: 2,
      });

      const { PostController } = await import('./post');
      const result = await PostController.getCounts({ compositeId: testData.fullPostId });

      expect(result!.tags).toBe(5);
      expect(result!.unique_tags).toBe(3);
      expect(result!.replies).toBe(10);
      expect(result!.reposts).toBe(2);
    });
  });

  describe('getReplies', () => {
    it('should return replies for a post when relationships store parent as URI', async () => {
      const { PostController } = await import('./post');

      const parentUri = `pubky://${testData.authorPubky}/pub/pubky.app/posts/${testData.postId}`;
      const replyOneId = buildCompositeId({ pubky: 'reply-author-1' as Pubky, id: 'reply-1' });
      const replyTwoId = buildCompositeId({ pubky: 'reply-author-2' as Pubky, id: 'reply-2' });

      await PostRelationshipsModel.table.bulkAdd([
        { id: replyOneId, replied: parentUri, reposted: null, mentioned: [] },
        { id: replyTwoId, replied: parentUri, reposted: null, mentioned: [] },
        {
          id: buildCompositeId({ pubky: 'reply-author-3' as Pubky, id: 'reply-3' }),
          replied: 'pubky://someone/pub/pubky.app/posts/another-parent',
          reposted: null,
          mentioned: [],
        },
      ]);

      const replies = await PostController.getReplies({ compositeId: testData.fullPostId });

      expect(replies).toHaveLength(2);
      expect(replies.map((reply) => reply.id)).toEqual(expect.arrayContaining([replyOneId, replyTwoId]));
      expect(replies.every((reply) => reply.replied === parentUri)).toBe(true);
    });

    it('should return empty array when a post has no replies', async () => {
      const { PostController } = await import('./post');

      const replies = await PostController.getReplies({ compositeId: testData.fullPostId });

      expect(replies).toEqual([]);
    });
  });

  describe('commitCreate', () => {
    beforeEach(() => {
      vi.spyOn(FileApplication, 'toFileAttachment').mockImplementation(async ({ file }) => {
        const safeName = encodeURIComponent(file.name || 'upload');

        return {
          blobResult: {
            blob: { data: new Uint8Array([1, 2, 3]) },
            meta: { url: `pubky://mock-author/pub/pubky.app/blobs/${safeName}` },
          } as TFileAttachmentResult['blobResult'],
          fileResult: {
            file: { toJson: () => ({}) },
            meta: { url: `pubky://mock-author/pub/pubky.app/files/${safeName}` },
          } as TFileAttachmentResult['fileResult'],
        };
      });
    });

    it('should create a post and sync to homeserver', async () => {
      const { PostController } = await import('./post');

      await PostController.commitCreate(createPostParams('Hello, world!'));

      const allPosts = await PostDetailsModel.table.toArray();
      expect(allPosts.length).toBeGreaterThan(0);

      const savedPost = allPosts[0];
      expect(savedPost.content).toBe('Hello, world!');
      expect(savedPost.kind).toBe('short'); // PubkyAppPostKind.Short

      // Verify homeserver sync was called
      expect(HomeserverService.request).toHaveBeenCalledWith({
        method: HttpMethod.PUT,
        url: expect.stringContaining('pubky://'),
        bodyJson: expect.any(Object),
      });
    });

    it('should create a reply when parentPostId is provided', async () => {
      await setupExistingPost();
      const { PostController } = await import('./post');

      await PostController.commitCreate(createPostParams('This is a reply', testData.fullPostId));

      const allPosts = await PostDetailsModel.table.toArray();
      const replyPost = allPosts.find((p) => p.content === 'This is a reply');

      expect(replyPost).toBeTruthy();
      expect(replyPost!.kind).toBe('short'); // PubkyAppPostKind.Short

      // Verify homeserver sync was called
      expect(HomeserverService.request).toHaveBeenCalledWith({
        method: HttpMethod.PUT,
        url: expect.stringContaining('pubky://'),
        bodyJson: expect.any(Object),
      });
    });

    it('should infer image kind when attachments contain image files', async () => {
      const { PostController } = await import('./post');
      const imageFile = new File(['image-content'], 'photo.png', { type: 'image/png' });

      await PostController.commitCreate({
        content: 'A post with image',
        authorId: testData.authorPubky,
        attachments: [imageFile],
      });

      const allPosts = await PostDetailsModel.table.toArray();
      const savedPost = allPosts.find((p) => p.content === 'A post with image');

      expect(savedPost?.kind).toBe('image');
      expect(HomeserverService.request).toHaveBeenCalledWith(
        expect.objectContaining({
          bodyJson: expect.objectContaining({ kind: 'image' }),
        }),
      );
    });

    it('should infer video kind when attachments contain video files', async () => {
      const { PostController } = await import('./post');
      const videoFile = new File(['video-content'], 'clip.mp4', { type: 'video/mp4' });

      await PostController.commitCreate({
        content: 'A post with video',
        authorId: testData.authorPubky,
        attachments: [videoFile],
      });

      const allPosts = await PostDetailsModel.table.toArray();
      const savedPost = allPosts.find((p) => p.content === 'A post with video');

      expect(savedPost?.kind).toBe('video');
      expect(HomeserverService.request).toHaveBeenCalledWith(
        expect.objectContaining({
          bodyJson: expect.objectContaining({ kind: 'video' }),
        }),
      );
    });

    it('should infer file kind when attachments are non-image and non-video', async () => {
      const { PostController } = await import('./post');
      const pdfFile = new File(['pdf-content'], 'doc.pdf', { type: 'application/pdf' });

      await PostController.commitCreate({
        content: 'A post with file',
        authorId: testData.authorPubky,
        attachments: [pdfFile],
      });

      const allPosts = await PostDetailsModel.table.toArray();
      const savedPost = allPosts.find((p) => p.content === 'A post with file');

      expect(savedPost?.kind).toBe('file');
      expect(HomeserverService.request).toHaveBeenCalledWith(
        expect.objectContaining({
          bodyJson: expect.objectContaining({ kind: 'file' }),
        }),
      );
    });

    it('should infer link kind when content has URL and no attachments', async () => {
      const { PostController } = await import('./post');

      await PostController.commitCreate({
        content: 'Visit https://pubky.app for details',
        authorId: testData.authorPubky,
      });

      const allPosts = await PostDetailsModel.table.toArray();
      const savedPost = allPosts.find((p) => p.content === 'Visit https://pubky.app for details');

      expect(savedPost?.kind).toBe('link');
      expect(HomeserverService.request).toHaveBeenCalledWith(
        expect.objectContaining({
          bodyJson: expect.objectContaining({ kind: 'link' }),
        }),
      );
    });

    it('should use long kind when isArticle is true', async () => {
      const { PostController } = await import('./post');

      await PostController.commitCreate({
        content: JSON.stringify({ title: 'My Article', body: 'Article body' }),
        authorId: testData.authorPubky,
        isArticle: true,
      });

      const allPosts = await PostDetailsModel.table.toArray();
      const savedPost = allPosts.find((p) => p.content.includes('My Article'));

      expect(savedPost?.kind).toBe('long');
      expect(HomeserverService.request).toHaveBeenCalledWith(
        expect.objectContaining({
          bodyJson: expect.objectContaining({ kind: 'long' }),
        }),
      );
    });

    it('should throw error when parent post not found', async () => {
      const { PostController } = await import('./post');

      await expect(PostController.commitCreate(createPostParams('Reply', 'nonexistent:post'))).rejects.toThrow(
        'Parent post not found',
      );
    });

    it('should propagate errors from application layer', async () => {
      const { PostController } = await import('./post');

      const createSpy = vi
        .spyOn(PostApplication, 'commitCreate')
        .mockRejectedValueOnce(new Error('Database transaction failed'));

      try {
        await expect(PostController.commitCreate(createPostParams('Will fail'))).rejects.toThrow(
          'Database transaction failed',
        );
      } finally {
        createSpy.mockRestore();
      }
    });

    it('should create a repost when originalPostId is provided', async () => {
      await setupExistingPost();
      const { PostController } = await import('./post');

      await PostController.commitCreate({
        content: 'Reposting this!',
        authorId: testData.authorPubky,
        originalPostId: testData.fullPostId,
      });

      const allPosts = await PostDetailsModel.table.toArray();
      const repost = allPosts.find((p) => p.content === 'Reposting this!');

      expect(repost).toBeTruthy();
      expect(repost!.kind).toBe('short');

      // Verify homeserver sync was called
      expect(HomeserverService.request).toHaveBeenCalledWith({
        method: HttpMethod.PUT,
        url: expect.stringContaining('pubky://'),
        bodyJson: expect.any(Object),
      });
    });

    it('should throw error when original post not found for repost', async () => {
      const { PostController } = await import('./post');

      await expect(
        PostController.commitCreate({
          content: 'Reposting this!',
          authorId: testData.authorPubky,
          originalPostId: 'nonexistent:post',
        }),
      ).rejects.toThrow('Original post not found');
    });

    it('should create repost with empty content', async () => {
      await setupExistingPost();
      const { PostController } = await import('./post');

      await PostController.commitCreate({
        content: '',
        authorId: testData.authorPubky,
        originalPostId: testData.fullPostId,
      });

      const allPosts = await PostDetailsModel.table.toArray();
      const repost = allPosts.find((p) => p.content === '');

      expect(repost).toBeTruthy();

      // Verify homeserver sync was called
      expect(HomeserverService.request).toHaveBeenCalledWith({
        method: HttpMethod.PUT,
        url: expect.stringContaining('pubky://'),
        bodyJson: expect.any(Object),
      });
    });

    it('should apply tags to the original post for a simple repost', async () => {
      await setupExistingPost();
      const postCommitSpy = vi.spyOn(PostApplication, 'commitCreate');

      const { PostController } = await import('./post');
      await PostController.commitCreate({
        content: '',
        authorId: testData.authorPubky,
        originalPostId: testData.fullPostId,
        tags: ['bitcoin'],
      });

      expect(postCommitSpy).toHaveBeenCalled();
      const { tags: tagList } = postCommitSpy.mock.calls[0][0];
      expect(tagList?.[0]?.taggedId).toBe(testData.fullPostId);
      expect(tagList?.[0]?.label).toBe('bitcoin');
    });

    it('should apply tags to the new post for a quote repost with text', async () => {
      await setupExistingPost();
      const postCommitSpy = vi.spyOn(PostApplication, 'commitCreate');

      const { PostController } = await import('./post');
      const createdId = await PostController.commitCreate({
        content: 'my comment',
        authorId: testData.authorPubky,
        originalPostId: testData.fullPostId,
        tags: ['ethereum'],
      });

      expect(postCommitSpy).toHaveBeenCalled();
      const { tags: tagList } = postCommitSpy.mock.calls[0][0];
      expect(tagList?.[0]?.taggedId).toBe(createdId);
      expect(tagList?.[0]?.label).toBe('ethereum');
    });

    it('should apply tags to the new post for a quote repost with attachment only', async () => {
      await setupExistingPost();
      const postCommitSpy = vi.spyOn(PostApplication, 'commitCreate');
      const imageFile = new File(['image-content'], 'photo.png', { type: 'image/png' });

      const { PostController } = await import('./post');
      const createdId = await PostController.commitCreate({
        content: '',
        authorId: testData.authorPubky,
        originalPostId: testData.fullPostId,
        attachments: [imageFile],
        tags: ['nft'],
      });

      expect(postCommitSpy).toHaveBeenCalled();
      const { tags: tagList } = postCommitSpy.mock.calls[0][0];
      expect(tagList?.[0]?.taggedId).toBe(createdId);
      expect(tagList?.[0]?.label).toBe('nft');
    });

    it('normalizes file attachments sequentially to avoid concurrent image decodes', async () => {
      const events: string[] = [];
      vi.spyOn(FileApplication, 'toFileAttachment').mockImplementation(async ({ file }) => {
        events.push(`start:${file.name}`);
        await Promise.resolve();
        events.push(`finish:${file.name}`);
        const safeName = encodeURIComponent(file.name);

        return {
          blobResult: {
            blob: { data: new Uint8Array([1, 2, 3]) },
            meta: { url: `pubky://mock-author/pub/pubky.app/blobs/${safeName}` },
          } as TFileAttachmentResult['blobResult'],
          fileResult: {
            file: { toJson: () => ({}) },
            meta: { url: `pubky://mock-author/pub/pubky.app/files/${safeName}` },
          } as TFileAttachmentResult['fileResult'],
        };
      });
      const firstFile = new File(['first'], 'first.jpg', { type: 'image/jpeg' });
      const secondFile = new File(['second'], 'second.jpg', { type: 'image/jpeg' });

      const { PostController } = await import('./post');
      await PostController.commitCreate({
        ...createPostParams('photos'),
        attachments: [firstFile, secondFile],
      });

      expect(events).toEqual(['start:first.jpg', 'finish:first.jpg', 'start:second.jpg', 'finish:second.jpg']);
    });
  });

  describe('commitDelete', () => {
    it('should call application layer when user is author', async () => {
      await setupExistingPost();
      setupAuthUser(testData.authorPubky);

      const { PostController } = await import('./post');

      const deleteSpy = vi.spyOn(PostApplication, 'commitDelete').mockResolvedValue(undefined);

      try {
        await PostController.commitDelete({ compositePostId: testData.fullPostId });

        expect(deleteSpy).toHaveBeenCalledWith({ compositePostId: testData.fullPostId });
      } finally {
        deleteSpy.mockRestore();
        cleanupAuthUser();
      }
    });

    it('should throw error when user is not the author', async () => {
      await setupExistingPost();
      setupAuthUser('different_user_pubky' as Pubky);

      const { PostController } = await import('./post');

      try {
        await expect(PostController.commitDelete({ compositePostId: testData.fullPostId })).rejects.toThrow(
          'User is not the author of this post',
        );
      } finally {
        cleanupAuthUser();
      }
    });

    it('should propagate errors from application layer', async () => {
      await setupExistingPost();
      setupAuthUser(testData.authorPubky);

      const { PostController } = await import('./post');

      const deleteSpy = vi
        .spyOn(PostApplication, 'commitDelete')
        .mockRejectedValueOnce(new Error('Database transaction failed'));

      try {
        await expect(PostController.commitDelete({ compositePostId: testData.fullPostId })).rejects.toThrow(
          'Database transaction failed',
        );
      } finally {
        deleteSpy.mockRestore();
        cleanupAuthUser();
      }
    });
  });

  describe('commitUpdateCollectionItem', () => {
    const collectionPostId = buildCompositeId({ pubky: testData.authorPubky, id: 'collection123' });
    const targetPostId = buildCompositeId({ pubky: 'target_author_pubky' as Pubky, id: 'target123' });
    const targetPostUri = 'pubky://target_author_pubky/pub/pubky.app/posts/target123';

    const createCollectionDetails = (items: string[] = [], overrides: Partial<PostDetailsModelSchema> = {}) =>
      ({
        id: collectionPostId,
        content: JSON.stringify({ name: 'Saved posts', description: '', items }),
        indexed_at: Date.now(),
        kind: 'collection',
        uri: `pubky://${testData.authorPubky}/pub/pubky.app/posts/collection123`,
        attachments: null,
        is_moderated: false,
        is_blurred: false,
        ...overrides,
      }) as Awaited<ReturnType<typeof PostApplication.getDetails>>;

    it('adds a post URI to a collection', async () => {
      setupAuthUser(testData.authorPubky);
      const getDetailsSpy = vi.spyOn(PostApplication, 'getDetails').mockResolvedValue(createCollectionDetails());
      const toEditSpy = vi.spyOn(PostNormalizer, 'toEdit').mockResolvedValue({
        post: { toJson: () => ({}) },
        meta: { url: 'pubky://author/pub/pubky.app/posts/collection123' },
      } as never);
      const commitEditSpy = vi.spyOn(PostApplication, 'commitEdit').mockResolvedValue(undefined);

      try {
        const { PostController } = await import('./post');
        await PostController.commitUpdateCollectionItem({
          collectionId: collectionPostId,
          postId: targetPostId,
          shouldAdd: true,
        });

        expect(getDetailsSpy).toHaveBeenCalledWith({ compositeId: collectionPostId });
        expect(toEditSpy).toHaveBeenCalledWith({
          compositePostId: collectionPostId,
          content: JSON.stringify({
            name: 'Saved posts',
            description: '',
            items: [targetPostUri],
            layout: COLLECTION_LAYOUT.GRID,
          }),
          currentUserPubky: testData.authorPubky,
        });
        expect(commitEditSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            compositePostId: collectionPostId,
            postUrl: 'pubky://author/pub/pubky.app/posts/collection123',
          }),
        );
      } finally {
        cleanupAuthUser();
      }
    });

    it('prepends a new post URI before existing collection items', async () => {
      setupAuthUser(testData.authorPubky);
      const existingItemUri = 'pubky://existing_author/pub/pubky.app/posts/existing123';
      vi.spyOn(PostApplication, 'getDetails').mockResolvedValue(createCollectionDetails([existingItemUri]));
      const toEditSpy = vi.spyOn(PostNormalizer, 'toEdit').mockResolvedValue({
        post: { toJson: () => ({}) },
        meta: { url: 'pubky://author/pub/pubky.app/posts/collection123' },
      } as never);
      vi.spyOn(PostApplication, 'commitEdit').mockResolvedValue(undefined);

      try {
        const { PostController } = await import('./post');
        await PostController.commitUpdateCollectionItem({
          collectionId: collectionPostId,
          postId: targetPostId,
          shouldAdd: true,
        });

        expect(toEditSpy).toHaveBeenCalledWith({
          compositePostId: collectionPostId,
          content: JSON.stringify({
            name: 'Saved posts',
            description: '',
            items: [targetPostUri, existingItemUri],
            layout: COLLECTION_LAYOUT.GRID,
          }),
          currentUserPubky: testData.authorPubky,
        });
      } finally {
        cleanupAuthUser();
      }
    });

    it('removes a post URI from a collection', async () => {
      setupAuthUser(testData.authorPubky);
      vi.spyOn(PostApplication, 'getDetails').mockResolvedValue(createCollectionDetails([targetPostUri]));
      const toEditSpy = vi.spyOn(PostNormalizer, 'toEdit').mockResolvedValue({
        post: { toJson: () => ({}) },
        meta: { url: 'pubky://author/pub/pubky.app/posts/collection123' },
      } as never);
      vi.spyOn(PostApplication, 'commitEdit').mockResolvedValue(undefined);

      try {
        const { PostController } = await import('./post');
        await PostController.commitUpdateCollectionItem({
          collectionId: collectionPostId,
          postId: targetPostId,
          shouldAdd: false,
        });

        expect(toEditSpy).toHaveBeenCalledWith({
          compositePostId: collectionPostId,
          content: JSON.stringify({
            name: 'Saved posts',
            description: '',
            items: [],
            layout: COLLECTION_LAYOUT.GRID,
          }),
          currentUserPubky: testData.authorPubky,
        });
      } finally {
        cleanupAuthUser();
      }
    });

    it('does not edit when adding an existing item or removing a missing item', async () => {
      setupAuthUser(testData.authorPubky);
      const getDetailsSpy = vi.spyOn(PostApplication, 'getDetails');
      const toEditSpy = vi.spyOn(PostNormalizer, 'toEdit');
      const commitEditSpy = vi.spyOn(PostApplication, 'commitEdit');
      const { PostController } = await import('./post');

      try {
        getDetailsSpy.mockResolvedValueOnce(createCollectionDetails([targetPostUri]));
        await PostController.commitUpdateCollectionItem({
          collectionId: collectionPostId,
          postId: targetPostId,
          shouldAdd: true,
        });

        getDetailsSpy.mockResolvedValueOnce(createCollectionDetails());
        await PostController.commitUpdateCollectionItem({
          collectionId: collectionPostId,
          postId: targetPostId,
          shouldAdd: false,
        });

        expect(toEditSpy).not.toHaveBeenCalled();
        expect(commitEditSpy).not.toHaveBeenCalled();
      } finally {
        cleanupAuthUser();
      }
    });

    it('rejects missing collections', async () => {
      setupAuthUser(testData.authorPubky);
      vi.spyOn(PostApplication, 'getDetails').mockResolvedValue(null);

      try {
        const { PostController } = await import('./post');
        await expect(
          PostController.commitUpdateCollectionItem({
            collectionId: collectionPostId,
            postId: targetPostId,
            shouldAdd: true,
          }),
        ).rejects.toThrow('Collection not found');
      } finally {
        cleanupAuthUser();
      }
    });

    it('rejects collections with invalid content', async () => {
      setupAuthUser(testData.authorPubky);
      vi.spyOn(PostApplication, 'getDetails').mockResolvedValue(createCollectionDetails([], { content: 'not-json' }));

      try {
        const { PostController } = await import('./post');
        await expect(
          PostController.commitUpdateCollectionItem({
            collectionId: collectionPostId,
            postId: targetPostId,
            shouldAdd: true,
          }),
        ).rejects.toThrow('Collection content is invalid');
      } finally {
        cleanupAuthUser();
      }
    });

    it('rejects tombstoned collections (content === [DELETED]) as not-found', async () => {
      // Regression: pre-tombstone refactor `!collection` caught hard-deleted
      // rows. Tombstones now stick around, and without the content check this
      // path would surface "Collection content is invalid" instead.
      setupAuthUser(testData.authorPubky);
      vi.spyOn(PostApplication, 'getDetails').mockResolvedValue(createCollectionDetails([], { content: '[DELETED]' }));

      try {
        const { PostController } = await import('./post');
        await expect(
          PostController.commitUpdateCollectionItem({
            collectionId: collectionPostId,
            postId: targetPostId,
            shouldAdd: true,
          }),
        ).rejects.toThrow('Collection not found');
      } finally {
        cleanupAuthUser();
      }
    });

    it('rejects edits when the current user is not the collection author', async () => {
      setupAuthUser('different_user_pubky' as Pubky);
      vi.spyOn(PostApplication, 'getDetails').mockResolvedValue(createCollectionDetails());

      try {
        const { PostController } = await import('./post');
        await expect(
          PostController.commitUpdateCollectionItem({
            collectionId: collectionPostId,
            postId: targetPostId,
            shouldAdd: true,
          }),
        ).rejects.toThrow('Current user is not the author of this post');
      } finally {
        cleanupAuthUser();
      }
    });
  });

  describe('commitEditCollection', () => {
    const collectionPostId = buildCompositeId({ pubky: testData.authorPubky, id: 'editCol1' });
    const existingItemUri = 'pubky://target_author_pubky/pub/pubky.app/posts/keep-me';

    const createCollectionDetails = (
      content: { name: string; description?: string; items?: string[]; cover_image?: string | null } = {
        name: 'Original name',
        description: 'Original description',
        items: [existingItemUri],
        cover_image: 'pubky://author/pub/pubky.app/files/oldcover',
      },
      overrides: Partial<PostDetailsModelSchema> = {},
    ) =>
      ({
        id: collectionPostId,
        content: JSON.stringify(content),
        indexed_at: Date.now(),
        kind: 'collection',
        uri: `pubky://${testData.authorPubky}/pub/pubky.app/posts/editCol1`,
        attachments: null,
        is_moderated: false,
        is_blurred: false,
        ...overrides,
      }) as Awaited<ReturnType<typeof PostApplication.getDetails>>;

    const stubToEdit = () =>
      vi.spyOn(PostNormalizer, 'toEdit').mockResolvedValue({
        post: { toJson: () => ({}) },
        meta: { url: 'pubky://author/pub/pubky.app/posts/editCol1' },
      } as never);

    it('preserves the existing items array, name/description updates, and passes through a string cover URL', async () => {
      setupAuthUser(testData.authorPubky);
      vi.spyOn(PostApplication, 'getDetails').mockResolvedValue(createCollectionDetails());
      const toEditSpy = stubToEdit();
      const commitEditSpy = vi.spyOn(PostApplication, 'commitEdit').mockResolvedValue(undefined);
      const toFileAttachmentSpy = vi.spyOn(FileApplication, 'toFileAttachment');

      try {
        const { PostController } = await import('./post');
        await PostController.commitEditCollection({
          compositeCollectionId: collectionPostId,
          name: 'Renamed',
          description: 'Updated description',
          coverImage: 'pubky://author/pub/pubky.app/files/oldcover',
        });

        expect(toFileAttachmentSpy).not.toHaveBeenCalled();
        expect(toEditSpy).toHaveBeenCalledWith({
          compositePostId: collectionPostId,
          content: JSON.stringify({
            name: 'Renamed',
            description: 'Updated description',
            items: [existingItemUri],
            cover_image: 'pubky://author/pub/pubky.app/files/oldcover',
            layout: COLLECTION_LAYOUT.GRID,
          }),
          currentUserPubky: testData.authorPubky,
        });
        expect(commitEditSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            compositePostId: collectionPostId,
            postUrl: 'pubky://author/pub/pubky.app/posts/editCol1',
          }),
        );
      } finally {
        cleanupAuthUser();
      }
    });

    it('uploads a new cover File, replaces cover_image with the resulting URL, and persists', async () => {
      setupAuthUser(testData.authorPubky);
      vi.spyOn(PostApplication, 'getDetails').mockResolvedValue(createCollectionDetails());
      const toEditSpy = stubToEdit();
      vi.spyOn(PostApplication, 'commitEdit').mockResolvedValue(undefined);

      const file = new File(['new-cover-bytes'], 'cover.png', { type: 'image/png' });
      const toFileAttachmentSpy = vi.spyOn(FileApplication, 'toFileAttachment').mockResolvedValue(
        asOpaque<TFileAttachmentResult>({
          fileResult: { meta: { url: 'pubky://author/pub/pubky.app/files/newcover' } },
        }),
      );
      const commitFileCreateSpy = vi.spyOn(FileApplication, 'commitCreate').mockResolvedValue(undefined);
      const commitFileDeleteSpy = vi.spyOn(FileApplication, 'commitDelete').mockResolvedValue(undefined);

      try {
        const { PostController } = await import('./post');
        await PostController.commitEditCollection({
          compositeCollectionId: collectionPostId,
          name: 'Renamed',
          description: 'Updated description',
          coverImage: file,
        });

        expect(toFileAttachmentSpy).toHaveBeenCalledWith({ file, pubky: testData.authorPubky });
        expect(commitFileCreateSpy).toHaveBeenCalled();
        expect(toEditSpy).toHaveBeenCalledWith({
          compositePostId: collectionPostId,
          content: JSON.stringify({
            name: 'Renamed',
            description: 'Updated description',
            items: [existingItemUri],
            cover_image: 'pubky://author/pub/pubky.app/files/newcover',
            layout: COLLECTION_LAYOUT.GRID,
          }),
          currentUserPubky: testData.authorPubky,
        });
        expect(commitFileDeleteSpy).toHaveBeenCalledWith(['pubky://author/pub/pubky.app/files/oldcover']);
      } finally {
        cleanupAuthUser();
      }
    });

    it('clears the cover when coverImage is null', async () => {
      setupAuthUser(testData.authorPubky);
      vi.spyOn(PostApplication, 'getDetails').mockResolvedValue(createCollectionDetails());
      const toEditSpy = stubToEdit();
      vi.spyOn(PostApplication, 'commitEdit').mockResolvedValue(undefined);
      const commitFileDeleteSpy = vi.spyOn(FileApplication, 'commitDelete').mockResolvedValue(undefined);

      try {
        const { PostController } = await import('./post');
        await PostController.commitEditCollection({
          compositeCollectionId: collectionPostId,
          name: 'Renamed',
          description: 'Updated description',
          coverImage: null,
        });

        const lastCall = toEditSpy.mock.calls.at(-1)?.[0] as { content: string } | undefined;
        expect(lastCall).toBeDefined();
        const parsedContent = JSON.parse(lastCall!.content);
        // cover_image is normalized to `undefined` (omitted) when input is null/empty —
        // the CollectionPostContent normalizer drops it from the envelope.
        expect(parsedContent).not.toHaveProperty('cover_image');
        expect(parsedContent.items).toEqual([existingItemUri]);
        expect(commitFileDeleteSpy).toHaveBeenCalledWith(['pubky://author/pub/pubky.app/files/oldcover']);
      } finally {
        cleanupAuthUser();
      }
    });

    it('does not delete the cover when the cover URL is unchanged', async () => {
      setupAuthUser(testData.authorPubky);
      vi.spyOn(PostApplication, 'getDetails').mockResolvedValue(createCollectionDetails());
      stubToEdit();
      vi.spyOn(PostApplication, 'commitEdit').mockResolvedValue(undefined);
      const commitFileDeleteSpy = vi.spyOn(FileApplication, 'commitDelete').mockResolvedValue(undefined);

      try {
        const { PostController } = await import('./post');
        await PostController.commitEditCollection({
          compositeCollectionId: collectionPostId,
          name: 'Renamed',
          description: 'Updated description',
          coverImage: 'pubky://author/pub/pubky.app/files/oldcover',
        });

        expect(commitFileDeleteSpy).not.toHaveBeenCalled();
      } finally {
        cleanupAuthUser();
      }
    });

    it('does not delete an external https cover when clearing', async () => {
      setupAuthUser(testData.authorPubky);
      vi.spyOn(PostApplication, 'getDetails').mockResolvedValue(
        createCollectionDetails({
          name: 'Original name',
          description: 'Original description',
          items: [existingItemUri],
          cover_image: 'https://example.com/cover.png',
        }),
      );
      stubToEdit();
      vi.spyOn(PostApplication, 'commitEdit').mockResolvedValue(undefined);
      const commitFileDeleteSpy = vi.spyOn(FileApplication, 'commitDelete').mockResolvedValue(undefined);

      try {
        const { PostController } = await import('./post');
        await PostController.commitEditCollection({
          compositeCollectionId: collectionPostId,
          name: 'Renamed',
          description: 'Updated description',
          coverImage: null,
        });

        expect(commitFileDeleteSpy).not.toHaveBeenCalled();
      } finally {
        cleanupAuthUser();
      }
    });

    it('rolls back a newly uploaded cover when commitEdit fails', async () => {
      setupAuthUser(testData.authorPubky);
      vi.spyOn(PostApplication, 'getDetails').mockResolvedValue(createCollectionDetails());
      stubToEdit();
      const editError = Err.server(ServerErrorCode.UNKNOWN_ERROR, 'homeserver put failed', {
        service: ErrorService.Homeserver,
        operation: 'commitEditCollection',
      });
      vi.spyOn(PostApplication, 'commitEdit').mockRejectedValue(editError);
      vi.spyOn(FileApplication, 'toFileAttachment').mockResolvedValue(
        asOpaque<TFileAttachmentResult>({
          fileResult: { meta: { url: 'pubky://author/pub/pubky.app/files/newcover' } },
        }),
      );
      vi.spyOn(FileApplication, 'commitCreate').mockResolvedValue(undefined);
      const commitFileDeleteSpy = vi.spyOn(FileApplication, 'commitDelete').mockResolvedValue(undefined);

      try {
        const { PostController } = await import('./post');
        await expect(
          PostController.commitEditCollection({
            compositeCollectionId: collectionPostId,
            name: 'Renamed',
            description: 'Updated description',
            coverImage: new File(['x'], 'cover.png', { type: 'image/png' }),
          }),
        ).rejects.toBe(editError);

        expect(commitFileDeleteSpy).toHaveBeenCalledWith(['pubky://author/pub/pubky.app/files/newcover']);
        expect(commitFileDeleteSpy).not.toHaveBeenCalledWith(['pubky://author/pub/pubky.app/files/oldcover']);
      } finally {
        cleanupAuthUser();
      }
    });

    it('rolls back a newly uploaded cover when edit normalization fails after upload', async () => {
      setupAuthUser(testData.authorPubky);
      vi.spyOn(PostApplication, 'getDetails').mockResolvedValue(createCollectionDetails());
      const normalizeError = Err.database(DatabaseErrorCode.QUERY_FAILED, 'post reload failed', {
        service: ErrorService.Local,
        operation: 'toEdit',
      });
      vi.spyOn(PostNormalizer, 'toEdit').mockRejectedValue(normalizeError);
      const commitEditSpy = vi.spyOn(PostApplication, 'commitEdit');
      vi.spyOn(FileApplication, 'toFileAttachment').mockResolvedValue(
        asOpaque<TFileAttachmentResult>({
          fileResult: { meta: { url: 'pubky://author/pub/pubky.app/files/newcover' } },
        }),
      );
      vi.spyOn(FileApplication, 'commitCreate').mockResolvedValue(undefined);
      const commitFileDeleteSpy = vi.spyOn(FileApplication, 'commitDelete').mockResolvedValue(undefined);

      try {
        const { PostController } = await import('./post');
        await expect(
          PostController.commitEditCollection({
            compositeCollectionId: collectionPostId,
            name: 'Renamed',
            description: 'Updated description',
            coverImage: new File(['x'], 'cover.png', { type: 'image/png' }),
          }),
        ).rejects.toBe(normalizeError);

        expect(commitEditSpy).not.toHaveBeenCalled();
        expect(commitFileDeleteSpy).toHaveBeenCalledWith(['pubky://author/pub/pubky.app/files/newcover']);
        expect(commitFileDeleteSpy).not.toHaveBeenCalledWith(['pubky://author/pub/pubky.app/files/oldcover']);
      } finally {
        cleanupAuthUser();
      }
    });

    it('rejects when the collection cannot be loaded', async () => {
      setupAuthUser(testData.authorPubky);
      vi.spyOn(PostApplication, 'getDetails').mockResolvedValue(null);

      try {
        const { PostController } = await import('./post');
        await expect(
          PostController.commitEditCollection({
            compositeCollectionId: collectionPostId,
            name: 'Renamed',
            description: '',
            coverImage: null,
          }),
        ).rejects.toThrow('Collection not found');
      } finally {
        cleanupAuthUser();
      }
    });

    it('rejects when the existing collection content is unparseable', async () => {
      setupAuthUser(testData.authorPubky);
      vi.spyOn(PostApplication, 'getDetails').mockResolvedValue(
        createCollectionDetails(undefined, { content: 'not-json' }),
      );

      try {
        const { PostController } = await import('./post');
        await expect(
          PostController.commitEditCollection({
            compositeCollectionId: collectionPostId,
            name: 'Renamed',
            description: '',
            coverImage: null,
          }),
        ).rejects.toThrow('Collection content is invalid');
      } finally {
        cleanupAuthUser();
      }
    });

    it('rejects tombstoned collections (content === [DELETED]) as not-found', async () => {
      // Regression: pre-tombstone refactor `!collection` caught hard-deleted
      // rows. Tombstones now stick around, and without the content check this
      // path would surface the misleading "Collection content is invalid".
      setupAuthUser(testData.authorPubky);
      vi.spyOn(PostApplication, 'getDetails').mockResolvedValue(
        createCollectionDetails(undefined, { content: '[DELETED]' }),
      );

      try {
        const { PostController } = await import('./post');
        await expect(
          PostController.commitEditCollection({
            compositeCollectionId: collectionPostId,
            name: 'Renamed',
            description: '',
            coverImage: null,
          }),
        ).rejects.toThrow('Collection not found');
      } finally {
        cleanupAuthUser();
      }
    });

    it('wraps cover-upload failures with a specific validation error', async () => {
      setupAuthUser(testData.authorPubky);
      vi.spyOn(PostApplication, 'getDetails').mockResolvedValue(createCollectionDetails());
      vi.spyOn(FileApplication, 'toFileAttachment').mockRejectedValue(new Error('boom'));

      try {
        const { PostController } = await import('./post');
        await expect(
          PostController.commitEditCollection({
            compositeCollectionId: collectionPostId,
            name: 'Renamed',
            description: '',
            coverImage: new File(['x'], 'cover.png', { type: 'image/png' }),
          }),
        ).rejects.toThrow('Failed to upload collection cover image');
      } finally {
        cleanupAuthUser();
      }
    });

    it('rejects when the current user is not the collection author', async () => {
      setupAuthUser('different_user_pubky' as Pubky);
      vi.spyOn(PostApplication, 'getDetails').mockResolvedValue(createCollectionDetails());

      try {
        const { PostController } = await import('./post');
        await expect(
          PostController.commitEditCollection({
            compositeCollectionId: collectionPostId,
            name: 'Renamed',
            description: '',
            coverImage: null,
          }),
        ).rejects.toThrow('Current user is not the author of this post');
      } finally {
        cleanupAuthUser();
      }
    });

    it('rejects a non-author before any side effects (no file upload, no DB read)', async () => {
      // Regression guard: a non-author passing a `File` cover must NOT trigger
      // the homeserver upload (which could orphan a file under their pubky).
      setupAuthUser('different_user_pubky' as Pubky);
      const getDetailsSpy = vi.spyOn(PostApplication, 'getDetails');
      const toFileAttachmentSpy = vi.spyOn(FileApplication, 'toFileAttachment');
      const commitFileCreateSpy = vi.spyOn(FileApplication, 'commitCreate');
      const commitEditSpy = vi.spyOn(PostApplication, 'commitEdit');

      try {
        const { PostController } = await import('./post');
        await expect(
          PostController.commitEditCollection({
            compositeCollectionId: collectionPostId,
            name: 'Renamed',
            description: '',
            coverImage: new File(['x'], 'cover.png', { type: 'image/png' }),
          }),
        ).rejects.toThrow('Current user is not the author of this post');

        expect(getDetailsSpy).not.toHaveBeenCalled();
        expect(toFileAttachmentSpy).not.toHaveBeenCalled();
        expect(commitFileCreateSpy).not.toHaveBeenCalled();
        expect(commitEditSpy).not.toHaveBeenCalled();
      } finally {
        cleanupAuthUser();
      }
    });
  });

  describe('getOrFetch', () => {
    const mockViewerId = 'test-viewer-id' as Pubky;

    it('should return post from local database if exists', async () => {
      await setupExistingPost();
      const { PostController } = await import('./post');

      const post = await PostController.getOrFetch({ compositeId: testData.fullPostId, viewerId: mockViewerId });

      expect(post).toBeTruthy();
      expect(post?.id).toBe(testData.fullPostId);
      expect(post?.content).toBe('Test post content');
    });

    it('should return null when PostApplication.getOrFetch returns null', async () => {
      const { PostController } = await import('./post');

      const getOrFetchSpy = vi.spyOn(PostApplication, 'getOrFetch').mockResolvedValue(null);

      try {
        const post = await PostController.getOrFetch({
          compositeId: 'nonexistent:post',
          viewerId: mockViewerId,
        });
        expect(post).toBeNull();
      } finally {
        getOrFetchSpy.mockRestore();
      }
    });

    it('should propagate error when PostApplication throws an error', async () => {
      const { PostController } = await import('./post');

      const getOrFetchSpy = vi.spyOn(PostApplication, 'getOrFetch').mockRejectedValueOnce(new Error('Nexus error'));

      try {
        await expect(PostController.getOrFetch({ compositeId: 'error:post', viewerId: mockViewerId })).rejects.toThrow(
          'Nexus error',
        );
      } finally {
        getOrFetchSpy.mockRestore();
      }
    });

    it('should call PostApplication.getOrFetch with correct postId', async () => {
      const { PostController } = await import('./post');

      const getOrFetchSpy = vi.spyOn(PostApplication, 'getOrFetch').mockResolvedValue(null);

      try {
        await PostController.getOrFetch({ compositeId: 'author:post123', viewerId: mockViewerId });
        expect(getOrFetchSpy).toHaveBeenCalledWith({ compositeId: 'author:post123', viewerId: mockViewerId });
      } finally {
        getOrFetchSpy.mockRestore();
      }
    });
  });

  describe('fetch', () => {
    const mockViewerId = 'test-viewer-id' as Pubky;

    it('should delegate to PostApplication.fetch', async () => {
      const { PostController } = await import('./post');

      const fetchSpy = vi.spyOn(PostApplication, 'fetch').mockResolvedValue(null);

      try {
        await PostController.fetch({ compositeId: 'author:post123', viewerId: mockViewerId });
        expect(fetchSpy).toHaveBeenCalledWith({ compositeId: 'author:post123', viewerId: mockViewerId });
      } finally {
        fetchSpy.mockRestore();
      }
    });

    it('should return null when PostApplication.fetch returns null', async () => {
      const { PostController } = await import('./post');

      const fetchSpy = vi.spyOn(PostApplication, 'fetch').mockResolvedValue(null);

      try {
        const post = await PostController.fetch({
          compositeId: 'nonexistent:post',
          viewerId: mockViewerId,
        });
        expect(post).toBeNull();
      } finally {
        fetchSpy.mockRestore();
      }
    });

    it('should propagate error when PostApplication.fetch throws', async () => {
      const { PostController } = await import('./post');

      const fetchSpy = vi.spyOn(PostApplication, 'fetch').mockRejectedValueOnce(new Error('Nexus error'));

      try {
        await expect(PostController.fetch({ compositeId: 'error:post', viewerId: mockViewerId })).rejects.toThrow(
          'Nexus error',
        );
      } finally {
        fetchSpy.mockRestore();
      }
    });
  });

  describe('fetchTaggers', () => {
    it('should call PostApplication.fetchTaggers and return result', async () => {
      const { PostController } = await import('./post');
      const params: TFetchPostTaggersParams = {
        compositeId: testData.fullPostId,
        label: 'bitcoin',
        skip: 0,
        limit: 20,
      };
      const mockTaggers: NexusTaggers = { relationship: false, users: ['user1' as Pubky] };

      const fetchTaggersSpy = vi.spyOn(PostApplication, 'fetchTaggers').mockResolvedValue(mockTaggers);

      try {
        const result = await PostController.fetchTaggers(params);

        expect(fetchTaggersSpy).toHaveBeenCalledWith(params);
        expect(result).toEqual(mockTaggers);
      } finally {
        fetchTaggersSpy.mockRestore();
      }
    });

    it('should propagate errors from PostApplication.fetchTaggers', async () => {
      const { PostController } = await import('./post');
      const params: TFetchPostTaggersParams = {
        compositeId: testData.fullPostId,
        label: 'bitcoin',
      };

      const fetchTaggersSpy = vi.spyOn(PostApplication, 'fetchTaggers').mockRejectedValue(new Error('Nexus failed'));

      try {
        await expect(PostController.fetchTaggers(params)).rejects.toThrow('Nexus failed');
        expect(fetchTaggersSpy).toHaveBeenCalledWith(params);
      } finally {
        fetchTaggersSpy.mockRestore();
      }
    });
  });

  describe('getRelationships', () => {
    it('should return post relationships when they exist', async () => {
      await setupExistingPost();
      const { PostController } = await import('./post');

      const relationships = await PostController.getRelationships({ compositeId: testData.fullPostId });

      expect(relationships).not.toBeNull();
      expect(relationships?.id).toBe(testData.fullPostId);
      expect(relationships?.replied).toBeNull();
      expect(relationships?.reposted).toBeNull();
      expect(relationships?.mentioned).toEqual([]);
    });

    it('should return null when post relationships do not exist', async () => {
      const { PostController } = await import('./post');

      const relationships = await PostController.getRelationships({ compositeId: 'nonexistent:post' });

      expect(relationships).toBeNull();
    });

    it('should return relationships with parent URI when post is a reply', async () => {
      const parentUri = 'pubky://parent/pub/pubky.app/posts/parent123';
      const postDetails: PostDetailsModelSchema = {
        id: testData.fullPostId,
        content: 'Reply post content',
        indexed_at: Date.now(),
        kind: 'short',
        uri: `pubky://${testData.authorPubky}/pub/pubky.app/posts/${testData.postId}`,
        attachments: null,
      };

      await PostDetailsModel.table.add(postDetails);
      await PostRelationshipsModel.table.add({
        id: testData.fullPostId,
        replied: parentUri,
        reposted: null,
        mentioned: [],
      });

      const { PostController } = await import('./post');
      const relationships = await PostController.getRelationships({ compositeId: testData.fullPostId });

      expect(relationships).not.toBeNull();
      expect(relationships?.replied).toBe(parentUri);
    });

    it('should call PostApplication.getRelationships with correct postId', async () => {
      const { PostController } = await import('./post');

      const getRelationshipsSpy = vi.spyOn(PostApplication, 'getRelationships').mockResolvedValue(null);

      try {
        await PostController.getRelationships({ compositeId: 'author:post123' });
        expect(getRelationshipsSpy).toHaveBeenCalledWith({ compositeId: 'author:post123' });
      } finally {
        getRelationshipsSpy.mockRestore();
      }
    });
  });
});
