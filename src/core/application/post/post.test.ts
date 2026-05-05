import { type BlobResult, type FileResult, PubkyAppPost, PubkyAppPostKind } from 'pubky-app-specs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FileApplication } from '@/application/file/file';
import { PostApplication } from '@/application/post/post';
import type { TCreatePostInput, TEditPostInput } from '@/application/post/post.types';
import { PostStreamApplication } from '@/application/stream/posts/post';
import { TagApplication } from '@/application/tag/tag';
import { TagKind, type TCreateTagInput } from '@/application/tag/tag.types';
import type { TFetchPostTaggersParams } from '@/controllers/post/post.types';
import { DatabaseErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { HttpMethod } from '@/libs/http/http.types';
import type { Pubky } from '@/models/models.types';
import type { PostCountsModelSchema } from '@/models/post/counts/postCounts.schema';
import { PostDetailsModel } from '@/models/post/details/postDetails';
import type { PostDetailsModelSchema } from '@/models/post/details/postDetails.schema';
import type { PostRelationshipsModelSchema } from '@/models/post/relationships/postRelationships.schema';
import type { TagCollectionModelSchema } from '@/models/shared/tag/tag.schema';
import type { TFileAttachmentResult } from '@/pipes/file/file.types';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { LocalPostService } from '@/services/local/post/post';
import type { NexusTaggers } from '@/services/nexus/nexus.types';
import { NexusPostService } from '@/services/nexus/post/post';
import { asOpaque } from '@/test-utils/type-assertions';

// Mock the Local.Post service
vi.mock('@/services/local/post/post', () => ({
  LocalPostService: {
    fetch: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
    edit: vi.fn(),
    readDetails: vi.fn(),
    readCounts: vi.fn(),
    readTags: vi.fn(),
    readRelationships: vi.fn(),
  },
}));

// Mock the HomeserverService
vi.mock('@/services/homeserver/homeserver', () => ({
  HomeserverService: {
    request: vi.fn(),
  },
}));

// Mock the FileApplication
vi.mock('@/application/file/file', () => ({
  FileApplication: {
    commitCreate: vi.fn(),
    commitDelete: vi.fn(),
  },
}));

// Mock the TagApplication
vi.mock('@/application/tag/tag', () => ({
  TagApplication: {
    commitCreate: vi.fn(),
    commitDelete: vi.fn(),
  },
}));

describe('Post Application', () => {
  // Test data factories
  const createMockPostData = (): TCreatePostInput => {
    const mockPost = new PubkyAppPost('Hello, world!', PubkyAppPostKind.Short, undefined, undefined, undefined);

    return {
      compositePostId: 'author:post123',
      post: mockPost,
      postUrl: 'pubky://author/pub/pubky.app/posts/post123',
    };
  };

  const createMockBlobResult = (url: string = 'pubky://author/pub/pubky.app/blobs/blob123'): BlobResult =>
    asOpaque<BlobResult>({
      blob: { data: new Uint8Array([1, 2, 3]) },
      meta: { url },
    });

  const createMockFileResult = (
    url: string = 'pubky://author/pub/pubky.app/files/file123',
    fileJson: Record<string, unknown> = { id: 'file-1', src: 'blob-url', content_type: 'image/png', size: 1024 },
  ): FileResult =>
    asOpaque<FileResult>({
      file: { toJson: vi.fn(() => fileJson) },
      meta: { url },
    });

  const createMockFileAttachment = (id: string = 'file1'): TFileAttachmentResult => ({
    blobResult: createMockBlobResult(`pubky://author/pub/pubky.app/blobs/${id}`),
    fileResult: createMockFileResult(`pubky://author/pub/pubky.app/files/${id}`, {
      id,
      src: `pubky://author/pub/pubky.app/blobs/${id}`,
      content_type: 'image/png',
      size: 1024,
    }),
  });

  const createMockTag = (id: string, label: string = 'test-tag'): TCreateTagInput => ({
    taggerId: 'author' as Pubky,
    taggedId: id,
    label,
    taggedKind: TagKind.POST,
    tagUrl: `pubky://author/pub/pubky.app/tags/${label}`,
    tagJson: { uri: `pubky://author/pub/pubky.app/posts/${id}`, label },
  });

  // Spy setup helpers
  const setupBasicSpies = () => ({
    saveSpy: vi.spyOn(LocalPostService, 'create').mockResolvedValue(undefined),
    deleteSpy: vi.spyOn(LocalPostService, 'delete').mockResolvedValue(false),
    requestSpy: vi.spyOn(HomeserverService, 'request').mockResolvedValue(undefined),
  });

  const setupCreateSpies = () => ({
    commitCreateSpy: vi.spyOn(FileApplication, 'commitCreate').mockResolvedValue(undefined),
    saveSpy: vi.spyOn(LocalPostService, 'create').mockResolvedValue(undefined),
    requestSpy: vi.spyOn(HomeserverService, 'request').mockResolvedValue(undefined),
    tagCreateSpy: vi.spyOn(TagApplication, 'commitCreate').mockResolvedValue(undefined),
  });

  const setupDeleteSpies = () => ({
    findByIdSpy: vi.spyOn(PostDetailsModel, 'findById'),
    deleteSpy: vi.spyOn(LocalPostService, 'delete'),
    requestSpy: vi.spyOn(HomeserverService, 'request').mockResolvedValue(undefined),
    fileCommitDeleteSpy: vi.spyOn(FileApplication, 'commitDelete').mockResolvedValue(undefined),
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('commitCreate', () => {
    it('should save post locally and sync to homeserver', async () => {
      const mockData = createMockPostData();
      const { saveSpy, requestSpy } = setupBasicSpies();

      await PostApplication.commitCreate(mockData);

      expect(saveSpy).toHaveBeenCalledWith({
        compositePostId: mockData.compositePostId,
        post: mockData.post,
      });
      expect(requestSpy).toHaveBeenCalledWith({
        method: HttpMethod.PUT,
        url: mockData.postUrl,
        bodyJson: expect.objectContaining({
          content: 'Hello, world!',
          kind: 'short',
        }),
      });
    });

    it('should propagate error when local save fails', async () => {
      const mockData = createMockPostData();
      const { saveSpy, requestSpy } = setupBasicSpies();
      saveSpy.mockRejectedValue(new Error('Database error'));

      await expect(PostApplication.commitCreate(mockData)).rejects.toThrow('Database error');
      expect(saveSpy).toHaveBeenCalledOnce();
      expect(requestSpy).not.toHaveBeenCalled();
    });

    it('should rollback local write and propagate error when homeserver sync fails', async () => {
      const mockData = createMockPostData();
      const { saveSpy, deleteSpy, requestSpy } = setupBasicSpies();
      requestSpy.mockRejectedValue(new Error('Failed to PUT to homeserver: 500'));

      await expect(PostApplication.commitCreate(mockData)).rejects.toThrow('Failed to PUT to homeserver: 500');
      expect(saveSpy).toHaveBeenCalledOnce();
      expect(requestSpy).toHaveBeenCalledOnce();
      expect(deleteSpy).toHaveBeenCalledWith({ compositePostId: mockData.compositePostId });
    });

    it('should propagate original error when rollback also fails', async () => {
      const mockData = createMockPostData();
      const { saveSpy, deleteSpy, requestSpy } = setupBasicSpies();
      requestSpy.mockRejectedValue(new Error('Failed to PUT to homeserver: 401'));
      deleteSpy.mockRejectedValue(new Error('Rollback DB error'));

      await expect(PostApplication.commitCreate(mockData)).rejects.toThrow('Failed to PUT to homeserver: 401');
      expect(saveSpy).toHaveBeenCalledOnce();
      expect(deleteSpy).toHaveBeenCalledWith({ compositePostId: mockData.compositePostId });
    });

    it('should handle posts with Long kind', async () => {
      const longPost = new PubkyAppPost('Long post content', PubkyAppPostKind.Long, undefined, undefined, undefined);
      const mockData: TCreatePostInput = {
        compositePostId: 'author:post456',
        post: longPost,
        postUrl: 'pubky://author/pub/pubky.app/posts/post456',
      };
      const { saveSpy, requestSpy } = setupBasicSpies();

      await PostApplication.commitCreate(mockData);

      expect(saveSpy).toHaveBeenCalledWith({
        compositePostId: mockData.compositePostId,
        post: longPost,
      });
      expect(requestSpy).toHaveBeenCalledWith({
        method: HttpMethod.PUT,
        url: mockData.postUrl,
        bodyJson: expect.objectContaining({
          content: 'Long post content',
          kind: 'long',
        }),
      });
    });

    it('should handle posts with parent URI (reply)', async () => {
      const replyPost = new PubkyAppPost(
        'Reply content',
        PubkyAppPostKind.Short,
        'pubky://parent-author/pub/pubky.app/posts/parent-post',
        undefined,
        undefined,
      );
      const mockData: TCreatePostInput = {
        compositePostId: 'author:post789',
        post: replyPost,
        postUrl: 'pubky://author/pub/pubky.app/posts/post789',
      };
      const { saveSpy, requestSpy } = setupBasicSpies();

      await PostApplication.commitCreate(mockData);

      expect(saveSpy).toHaveBeenCalledWith({
        compositePostId: mockData.compositePostId,
        post: replyPost,
      });
      expect(requestSpy).toHaveBeenCalledWith({
        method: HttpMethod.PUT,
        url: mockData.postUrl,
        bodyJson: expect.objectContaining({
          content: 'Reply content',
          kind: 'short',
        }),
      });
    });

    // --- File Attachments ---
    describe('with file attachments', () => {
      it('should upload files before saving post locally', async () => {
        const mockFileAttachments = [createMockFileAttachment('file1')];

        const mockPost = new PubkyAppPost('Post with image', PubkyAppPostKind.Short, undefined, undefined, undefined);
        const mockData: TCreatePostInput = {
          compositePostId: 'author:post-with-files',
          post: mockPost,
          postUrl: 'pubky://author/pub/pubky.app/posts/post-with-files',
          fileAttachments: mockFileAttachments,
        };

        const { commitCreateSpy, saveSpy, requestSpy } = setupCreateSpies();

        await PostApplication.commitCreate(mockData);

        expect(commitCreateSpy).toHaveBeenCalledWith({ fileAttachments: mockFileAttachments });
        expect(commitCreateSpy).toHaveBeenCalledBefore(saveSpy);
        expect(saveSpy).toHaveBeenCalledWith({
          compositePostId: mockData.compositePostId,
          post: mockData.post,
        });
        expect(requestSpy).toHaveBeenCalledWith({
          method: HttpMethod.PUT,
          url: mockData.postUrl,
          bodyJson: expect.objectContaining({
            content: 'Post with image',
            kind: 'short',
          }),
        });
      });

      it('should fail fast on file upload error', async () => {
        const mockFileAttachments = [createMockFileAttachment('file2')];

        const mockPost = new PubkyAppPost('Post with video', PubkyAppPostKind.Short, undefined, undefined, undefined);
        const mockData: TCreatePostInput = {
          compositePostId: 'author:post-with-video',
          post: mockPost,
          postUrl: 'pubky://author/pub/pubky.app/posts/post-with-video',
          fileAttachments: mockFileAttachments,
        };

        const { commitCreateSpy, saveSpy, requestSpy } = setupCreateSpies();
        commitCreateSpy.mockRejectedValue(new Error('File upload failed: quota exceeded'));

        await expect(PostApplication.commitCreate(mockData)).rejects.toThrow('File upload failed: quota exceeded');

        expect(commitCreateSpy).toHaveBeenCalledWith({ fileAttachments: mockFileAttachments });
        expect(saveSpy).not.toHaveBeenCalled();
        expect(requestSpy).not.toHaveBeenCalled();
      });
    });

    // --- Tags ---
    describe('with tags', () => {
      it('should create tags after homeserver sync', async () => {
        const mockTags = [createMockTag('author:post-with-tags', 'technology')];

        const mockPost = new PubkyAppPost('Post with tags', PubkyAppPostKind.Short, undefined, undefined, undefined);
        const mockData: TCreatePostInput = {
          compositePostId: 'author:post-with-tags',
          post: mockPost,
          postUrl: 'pubky://author/pub/pubky.app/posts/post-with-tags',
          tags: mockTags,
        };

        const { saveSpy, requestSpy, tagCreateSpy } = setupCreateSpies();

        await PostApplication.commitCreate(mockData);

        expect(tagCreateSpy).toHaveBeenCalledWith({ tagList: mockTags });
        expect(requestSpy).toHaveBeenCalledBefore(tagCreateSpy);
        expect(saveSpy).toHaveBeenCalledWith({
          compositePostId: mockData.compositePostId,
          post: mockData.post,
        });
        expect(requestSpy).toHaveBeenCalledWith({
          method: HttpMethod.PUT,
          url: mockData.postUrl,
          bodyJson: expect.objectContaining({
            content: 'Post with tags',
            kind: 'short',
          }),
        });
      });

      it('should propagate tag creation error after post sync', async () => {
        const mockTags = [createMockTag('author:post-with-tags-fail', 'science')];

        const mockPost = new PubkyAppPost(
          'Post with failing tags',
          PubkyAppPostKind.Short,
          undefined,
          undefined,
          undefined,
        );
        const mockData: TCreatePostInput = {
          compositePostId: 'author:post-with-tags-fail',
          post: mockPost,
          postUrl: 'pubky://author/pub/pubky.app/posts/post-with-tags-fail',
          tags: mockTags,
        };

        const { saveSpy, requestSpy, tagCreateSpy } = setupCreateSpies();
        tagCreateSpy.mockRejectedValue(new Error('Tag creation failed: database locked'));

        await expect(PostApplication.commitCreate(mockData)).rejects.toThrow('Tag creation failed: database locked');

        expect(saveSpy).toHaveBeenCalledWith({
          compositePostId: mockData.compositePostId,
          post: mockData.post,
        });
        expect(requestSpy).toHaveBeenCalledWith({
          method: HttpMethod.PUT,
          url: mockData.postUrl,
          bodyJson: expect.objectContaining({
            content: 'Post with failing tags',
            kind: 'short',
          }),
        });
        expect(tagCreateSpy).toHaveBeenCalledWith({ tagList: mockTags });
      });
    });

    // --- Combined Scenarios ---
    describe('with both file attachments and tags', () => {
      it('should execute full workflow with files and tags', async () => {
        const mockFileAttachments = [createMockFileAttachment('file-combo')];
        const mockTags = [createMockTag('author:post-combo', 'photography')];

        const mockPost = new PubkyAppPost(
          'Post with files and tags',
          PubkyAppPostKind.Short,
          undefined,
          undefined,
          undefined,
        );
        const mockData: TCreatePostInput = {
          compositePostId: 'author:post-combo',
          post: mockPost,
          postUrl: 'pubky://author/pub/pubky.app/posts/post-combo',
          fileAttachments: mockFileAttachments,
          tags: mockTags,
        };

        const { commitCreateSpy, saveSpy, requestSpy, tagCreateSpy } = setupCreateSpies();

        await PostApplication.commitCreate(mockData);

        expect(commitCreateSpy).toHaveBeenCalledWith({ fileAttachments: mockFileAttachments });
        expect(saveSpy).toHaveBeenCalledWith({
          compositePostId: mockData.compositePostId,
          post: mockData.post,
        });
        expect(requestSpy).toHaveBeenCalledWith({
          method: HttpMethod.PUT,
          url: mockData.postUrl,
          bodyJson: expect.objectContaining({
            content: 'Post with files and tags',
            kind: 'short',
          }),
        });
        expect(tagCreateSpy).toHaveBeenCalledWith({ tagList: mockTags });
        expect(commitCreateSpy).toHaveBeenCalledBefore(saveSpy);
        expect(saveSpy).toHaveBeenCalledBefore(requestSpy);
        expect(requestSpy).toHaveBeenCalledBefore(tagCreateSpy);
      });

      it('should rollback local write, rollback files, and skip tags when homeserver sync fails', async () => {
        const mockFileAttachments = [createMockFileAttachment('file-fail')];
        const mockTags = [createMockTag('author:post-fail', 'art')];

        const mockPost = new PubkyAppPost(
          'Post with homeserver failure',
          PubkyAppPostKind.Short,
          undefined,
          undefined,
          undefined,
        );
        const mockData: TCreatePostInput = {
          compositePostId: 'author:post-fail',
          post: mockPost,
          postUrl: 'pubky://author/pub/pubky.app/posts/post-fail',
          fileAttachments: mockFileAttachments,
          tags: mockTags,
        };

        const { commitCreateSpy, saveSpy, requestSpy, tagCreateSpy } = setupCreateSpies();
        const deleteSpy = vi.spyOn(LocalPostService, 'delete').mockResolvedValue(false);
        const fileCommitDeleteSpy = vi.spyOn(FileApplication, 'commitDelete').mockResolvedValue(undefined);
        requestSpy.mockRejectedValue(new Error('Homeserver sync failed: 503 Service Unavailable'));

        await expect(PostApplication.commitCreate(mockData)).rejects.toThrow(
          'Homeserver sync failed: 503 Service Unavailable',
        );

        expect(commitCreateSpy).toHaveBeenCalledWith({ fileAttachments: mockFileAttachments });
        expect(saveSpy).toHaveBeenCalledWith({
          compositePostId: mockData.compositePostId,
          post: mockData.post,
        });
        expect(requestSpy).toHaveBeenCalledWith({
          method: HttpMethod.PUT,
          url: mockData.postUrl,
          bodyJson: expect.objectContaining({
            content: 'Post with homeserver failure',
            kind: 'short',
          }),
        });
        expect(deleteSpy).toHaveBeenCalledWith({ compositePostId: mockData.compositePostId });
        expect(fileCommitDeleteSpy).toHaveBeenCalledWith(mockFileAttachments.map((f) => f.fileResult.meta.url));
        expect(tagCreateSpy).not.toHaveBeenCalled();
      });

      it('should propagate original error when file rollback also fails', async () => {
        const mockFileAttachments = [createMockFileAttachment('file-rollback-fail')];

        const mockPost = new PubkyAppPost(
          'Post with file rollback failure',
          PubkyAppPostKind.Short,
          undefined,
          undefined,
          undefined,
        );
        const mockData: TCreatePostInput = {
          compositePostId: 'author:post-file-rollback-fail',
          post: mockPost,
          postUrl: 'pubky://author/pub/pubky.app/posts/post-file-rollback-fail',
          fileAttachments: mockFileAttachments,
        };

        const { commitCreateSpy, saveSpy, requestSpy } = setupCreateSpies();
        const deleteSpy = vi.spyOn(LocalPostService, 'delete').mockResolvedValue(false);
        const fileCommitDeleteSpy = vi
          .spyOn(FileApplication, 'commitDelete')
          .mockRejectedValue(new Error('File rollback failed'));
        requestSpy.mockRejectedValue(new Error('Homeserver sync failed: 401'));

        await expect(PostApplication.commitCreate(mockData)).rejects.toThrow('Homeserver sync failed: 401');

        expect(commitCreateSpy).toHaveBeenCalledWith({ fileAttachments: mockFileAttachments });
        expect(saveSpy).toHaveBeenCalledOnce();
        expect(deleteSpy).toHaveBeenCalledWith({ compositePostId: mockData.compositePostId });
        expect(fileCommitDeleteSpy).toHaveBeenCalledWith(mockFileAttachments.map((f) => f.fileResult.meta.url));
      });
    });
  });

  describe('commitDelete', () => {
    const createMockDeleteData = () => ({
      compositePostId: 'author:post123',
    });

    const mockPostDetails = {
      id: 'author:post123',
      content: 'Test post',
      kind: PubkyAppPostKind.Short,
      uri: 'pubky://author/pub/pubky.app/posts/post123',
      indexed_at: Date.now(),
      attachments: null,
    };

    const mockPostDetailsWithAttachments = {
      id: 'author:post-with-files',
      content: 'Post with files',
      kind: PubkyAppPostKind.Short,
      uri: 'pubky://author/pub/pubky.app/posts/post-with-files',
      indexed_at: Date.now(),
      attachments: ['pubky://author/pub/pubky.app/files/file1', 'pubky://author/pub/pubky.app/files/file2'],
    };

    it('should fetch post, delete locally and sync to homeserver', async () => {
      const mockData = createMockDeleteData();
      const { findByIdSpy, deleteSpy, requestSpy } = setupDeleteSpies();
      findByIdSpy.mockResolvedValue(mockPostDetails);
      deleteSpy.mockResolvedValue(false);

      await PostApplication.commitDelete(mockData);

      expect(findByIdSpy).toHaveBeenCalledWith(mockData.compositePostId);
      expect(deleteSpy).toHaveBeenCalledWith({
        compositePostId: mockData.compositePostId,
      });
      expect(requestSpy).toHaveBeenCalledWith({ method: HttpMethod.DELETE, url: mockPostDetails.uri });
    });

    it('should throw error when post not found', async () => {
      const mockData = createMockDeleteData();
      const { findByIdSpy } = setupDeleteSpies();
      findByIdSpy.mockResolvedValue(null);

      await expect(PostApplication.commitDelete(mockData)).rejects.toThrow('Post not found');

      expect(findByIdSpy).toHaveBeenCalledWith(mockData.compositePostId);
    });

    it('should propagate error when local delete fails', async () => {
      const mockData = createMockDeleteData();
      const { findByIdSpy, deleteSpy, requestSpy } = setupDeleteSpies();
      findByIdSpy.mockResolvedValue(mockPostDetails);
      deleteSpy.mockRejectedValue(new Error('local-delete-fail'));

      await expect(PostApplication.commitDelete(mockData)).rejects.toThrow('local-delete-fail');

      expect(findByIdSpy).toHaveBeenCalledWith(mockData.compositePostId);
      expect(deleteSpy).toHaveBeenCalledWith({ compositePostId: mockData.compositePostId });
      expect(requestSpy).not.toHaveBeenCalled();
    });

    it('should propagate error when homeserver delete fails', async () => {
      const mockData = createMockDeleteData();
      const { findByIdSpy, deleteSpy, requestSpy } = setupDeleteSpies();
      findByIdSpy.mockResolvedValue(mockPostDetails);
      deleteSpy.mockResolvedValue(false);
      requestSpy.mockRejectedValue(new Error('Failed to DELETE from homeserver: 500'));

      await expect(PostApplication.commitDelete(mockData)).rejects.toThrow('Failed to DELETE from homeserver: 500');

      expect(findByIdSpy).toHaveBeenCalledWith(mockData.compositePostId);
      expect(deleteSpy).toHaveBeenCalledWith({ compositePostId: mockData.compositePostId });
      expect(requestSpy).toHaveBeenCalledWith({ method: HttpMethod.DELETE, url: mockPostDetails.uri });
    });

    it('should propagate database error when findById throws', async () => {
      const mockData = createMockDeleteData();
      const databaseError = Err.database(DatabaseErrorCode.QUERY_FAILED, 'Database connection failed', {
        service: ErrorService.Local,
        operation: 'findById',
        context: { compositePostId: mockData.compositePostId },
      });
      const { findByIdSpy, deleteSpy, requestSpy } = setupDeleteSpies();
      findByIdSpy.mockRejectedValue(databaseError);

      await expect(PostApplication.commitDelete(mockData)).rejects.toThrow('Database connection failed');

      expect(findByIdSpy).toHaveBeenCalledWith(mockData.compositePostId);
      expect(deleteSpy).not.toHaveBeenCalled();
      expect(requestSpy).not.toHaveBeenCalled();
    });

    // --- Connection Scenarios ---
    describe('when post has connections (hadConnections = true)', () => {
      it('should call homeserver DELETE but skip file deletion', async () => {
        const mockData = createMockDeleteData();
        const { findByIdSpy, deleteSpy, requestSpy, fileCommitDeleteSpy } = setupDeleteSpies();
        findByIdSpy.mockResolvedValue(mockPostDetailsWithAttachments);
        deleteSpy.mockResolvedValue(true);

        await PostApplication.commitDelete(mockData);

        expect(findByIdSpy).toHaveBeenCalledWith(mockData.compositePostId);
        expect(deleteSpy).toHaveBeenCalledWith({
          compositePostId: mockData.compositePostId,
        });
        // Homeserver DELETE is always called, even for soft deletes
        expect(requestSpy).toHaveBeenCalledWith({ method: HttpMethod.DELETE, url: mockPostDetailsWithAttachments.uri });
        // File cleanup is skipped when post has connections
        expect(fileCommitDeleteSpy).not.toHaveBeenCalled();
      });

      it('should delete from homeserver but skip file cleanup when post has connections', async () => {
        const mockData = { compositePostId: 'author:post-with-connections' };
        const postWithAttachments = {
          ...mockPostDetailsWithAttachments,
          id: 'author:post-with-connections',
          attachments: [
            'pubky://author/pub/pubky.app/files/important-file',
            'pubky://author/pub/pubky.app/files/shared-image',
          ],
        };

        const { findByIdSpy, deleteSpy, requestSpy, fileCommitDeleteSpy } = setupDeleteSpies();
        findByIdSpy.mockResolvedValue(postWithAttachments);
        deleteSpy.mockResolvedValue(true);

        await PostApplication.commitDelete(mockData);

        expect(findByIdSpy).toHaveBeenCalledWith(mockData.compositePostId);
        expect(deleteSpy).toHaveBeenCalledWith({ compositePostId: mockData.compositePostId });
        // Always sync deletion to homeserver (Nexus determines definitive state)
        expect(requestSpy).toHaveBeenCalledWith({ method: HttpMethod.DELETE, url: postWithAttachments.uri });
        // Files are preserved when post has connections (soft delete)
        expect(fileCommitDeleteSpy).not.toHaveBeenCalled();
      });
    });

    // --- File Attachment Deletion ---
    describe('with file attachments (hadConnections = false)', () => {
      it('should delete files after homeserver deletion', async () => {
        const mockData = { compositePostId: 'author:post-with-files-delete' };
        const postWithFiles = {
          id: 'author:post-with-files-delete',
          content: 'Post with files to delete',
          kind: PubkyAppPostKind.Short,
          uri: 'pubky://author/pub/pubky.app/posts/post-with-files-delete',
          indexed_at: Date.now(),
          attachments: ['pubky://author/pub/pubky.app/files/file1', 'pubky://author/pub/pubky.app/files/file2'],
        };

        const { findByIdSpy, deleteSpy, requestSpy, fileCommitDeleteSpy } = setupDeleteSpies();
        findByIdSpy.mockResolvedValue(postWithFiles);
        deleteSpy.mockResolvedValue(false);

        await PostApplication.commitDelete(mockData);

        expect(findByIdSpy).toHaveBeenCalledWith(mockData.compositePostId);
        expect(deleteSpy).toHaveBeenCalledWith({ compositePostId: mockData.compositePostId });
        expect(requestSpy).toHaveBeenCalledWith({ method: HttpMethod.DELETE, url: postWithFiles.uri });
        expect(fileCommitDeleteSpy).toHaveBeenCalledWith(postWithFiles.attachments);
        expect(requestSpy).toHaveBeenCalledBefore(fileCommitDeleteSpy);
      });

      it('should skip file cleanup when no attachments', async () => {
        const mockData = { compositePostId: 'author:post-no-files' };
        const postWithoutFiles = {
          id: 'author:post-no-files',
          content: 'Post without files',
          kind: PubkyAppPostKind.Short,
          uri: 'pubky://author/pub/pubky.app/posts/post-no-files',
          indexed_at: Date.now(),
          attachments: null,
        };

        const { findByIdSpy, deleteSpy, requestSpy, fileCommitDeleteSpy } = setupDeleteSpies();
        findByIdSpy.mockResolvedValue(postWithoutFiles);
        deleteSpy.mockResolvedValue(false);

        await PostApplication.commitDelete(mockData);

        expect(findByIdSpy).toHaveBeenCalledWith(mockData.compositePostId);
        expect(deleteSpy).toHaveBeenCalledWith({ compositePostId: mockData.compositePostId });
        expect(requestSpy).toHaveBeenCalledWith({ method: HttpMethod.DELETE, url: postWithoutFiles.uri });
        expect(fileCommitDeleteSpy).not.toHaveBeenCalled();
      });

      it('should propagate file deletion error', async () => {
        const mockData = { compositePostId: 'author:post-file-delete-fail' };
        const postWithFiles = {
          id: 'author:post-file-delete-fail',
          content: 'Post with file deletion failure',
          kind: PubkyAppPostKind.Short,
          uri: 'pubky://author/pub/pubky.app/posts/post-file-delete-fail',
          indexed_at: Date.now(),
          attachments: ['pubky://author/pub/pubky.app/files/stubborn-file'],
        };

        const { findByIdSpy, deleteSpy, requestSpy, fileCommitDeleteSpy } = setupDeleteSpies();
        findByIdSpy.mockResolvedValue(postWithFiles);
        deleteSpy.mockResolvedValue(false);
        fileCommitDeleteSpy.mockRejectedValue(new Error('File deletion failed: permission denied'));

        await expect(PostApplication.commitDelete(mockData)).rejects.toThrow('File deletion failed: permission denied');

        expect(findByIdSpy).toHaveBeenCalledWith(mockData.compositePostId);
        expect(deleteSpy).toHaveBeenCalledWith({ compositePostId: mockData.compositePostId });
        expect(requestSpy).toHaveBeenCalledWith({ method: HttpMethod.DELETE, url: postWithFiles.uri });
        expect(fileCommitDeleteSpy).toHaveBeenCalledWith(postWithFiles.attachments);
      });
    });

    // --- Edge Cases ---
    describe('edge cases with empty arrays', () => {
      it('should skip tag creation with empty array', async () => {
        const mockPost = new PubkyAppPost(
          'Post with empty tags',
          PubkyAppPostKind.Short,
          undefined,
          undefined,
          undefined,
        );
        const mockData: TCreatePostInput = {
          compositePostId: 'author:post-empty-tags',
          post: mockPost,
          postUrl: 'pubky://author/pub/pubky.app/posts/post-empty-tags',
          tags: [],
        };

        const { saveSpy, requestSpy, tagCreateSpy } = setupCreateSpies();

        await PostApplication.commitCreate(mockData);

        expect(saveSpy).toHaveBeenCalledWith({
          compositePostId: mockData.compositePostId,
          post: mockData.post,
        });
        expect(requestSpy).toHaveBeenCalledWith({
          method: HttpMethod.PUT,
          url: mockData.postUrl,
          bodyJson: expect.objectContaining({
            content: 'Post with empty tags',
            kind: 'short',
          }),
        });
        expect(tagCreateSpy).not.toHaveBeenCalled();
      });

      it('should skip file upload with empty array', async () => {
        const mockPost = new PubkyAppPost(
          'Post with empty files',
          PubkyAppPostKind.Short,
          undefined,
          undefined,
          undefined,
        );
        const mockData: TCreatePostInput = {
          compositePostId: 'author:post-empty-files',
          post: mockPost,
          postUrl: 'pubky://author/pub/pubky.app/posts/post-empty-files',
          fileAttachments: [],
        };

        const { commitCreateSpy, saveSpy, requestSpy } = setupCreateSpies();

        await PostApplication.commitCreate(mockData);

        expect(commitCreateSpy).not.toHaveBeenCalled();
        expect(saveSpy).toHaveBeenCalledWith({
          compositePostId: mockData.compositePostId,
          post: mockData.post,
        });
        expect(requestSpy).toHaveBeenCalledWith({
          method: HttpMethod.PUT,
          url: mockData.postUrl,
          bodyJson: expect.objectContaining({
            content: 'Post with empty files',
            kind: 'short',
          }),
        });
      });

      it('should handle empty files and tags', async () => {
        const mockPost = new PubkyAppPost(
          'Post with all empty arrays',
          PubkyAppPostKind.Short,
          undefined,
          undefined,
          undefined,
        );
        const mockData: TCreatePostInput = {
          compositePostId: 'author:post-all-empty',
          post: mockPost,
          postUrl: 'pubky://author/pub/pubky.app/posts/post-all-empty',
          fileAttachments: [],
          tags: [],
        };

        const { commitCreateSpy, saveSpy, requestSpy, tagCreateSpy } = setupCreateSpies();

        await PostApplication.commitCreate(mockData);

        expect(commitCreateSpy).not.toHaveBeenCalled();
        expect(tagCreateSpy).not.toHaveBeenCalled();
        expect(saveSpy).toHaveBeenCalledWith({
          compositePostId: mockData.compositePostId,
          post: mockData.post,
        });
        expect(requestSpy).toHaveBeenCalledWith({
          method: HttpMethod.PUT,
          url: mockData.postUrl,
          bodyJson: expect.objectContaining({
            content: 'Post with all empty arrays',
            kind: 'short',
          }),
        });
      });

      it('should skip cleanup with empty attachments', async () => {
        const mockData = { compositePostId: 'author:post-empty-attachments' };
        const postWithEmptyAttachments = {
          id: 'author:post-empty-attachments',
          content: 'Post with empty attachments array',
          kind: PubkyAppPostKind.Short,
          uri: 'pubky://author/pub/pubky.app/posts/post-empty-attachments',
          indexed_at: Date.now(),
          attachments: [],
        };

        const { findByIdSpy, deleteSpy, requestSpy, fileCommitDeleteSpy } = setupDeleteSpies();
        findByIdSpy.mockResolvedValue(postWithEmptyAttachments);
        deleteSpy.mockResolvedValue(false);

        await PostApplication.commitDelete(mockData);

        expect(findByIdSpy).toHaveBeenCalledWith(mockData.compositePostId);
        expect(deleteSpy).toHaveBeenCalledWith({ compositePostId: mockData.compositePostId });
        expect(requestSpy).toHaveBeenCalledWith({ method: HttpMethod.DELETE, url: postWithEmptyAttachments.uri });
        expect(fileCommitDeleteSpy).not.toHaveBeenCalled();
      });
    });
  });

  describe('getOrFetch', () => {
    const mockPostDetails: PostDetailsModelSchema = {
      id: 'author:post123',
      content: 'Test post',
      kind: 'short',
      uri: 'pubky://author/pub/pubky.app/posts/post123',
      indexed_at: Date.now(),
      attachments: null,
    };

    it('should return post from local database if exists', async () => {
      const mockViewerId = 'test-viewer-id' as Pubky;
      const readSpy = vi.spyOn(LocalPostService, 'readDetails').mockResolvedValue(mockPostDetails);

      const result = await PostApplication.getOrFetch({
        compositeId: 'author:post123',
        viewerId: mockViewerId,
      });

      expect(readSpy).toHaveBeenCalledWith({ postId: 'author:post123' });
      expect(result).toEqual(mockPostDetails);
    });

    it('should fetch post from Nexus using stream posts logic', async () => {
      const mockViewerId = 'test-viewer-id' as Pubky;
      const readSpyFirst = vi.spyOn(LocalPostService, 'readDetails').mockResolvedValueOnce(null);
      const fetchMissingSpy = vi
        .spyOn(PostStreamApplication, 'fetchMissingPostsFromNexus')
        .mockResolvedValue(undefined);
      const readSpySecond = vi.spyOn(LocalPostService, 'readDetails').mockResolvedValueOnce(mockPostDetails);

      const result = await PostApplication.getOrFetch({
        compositeId: 'author:post123',
        viewerId: mockViewerId,
      });

      expect(readSpyFirst).toHaveBeenCalledWith({ postId: 'author:post123' });
      expect(fetchMissingSpy).toHaveBeenCalledWith({
        cacheMissPostIds: ['author:post123'],
        viewerId: mockViewerId,
      });
      expect(readSpySecond).toHaveBeenCalledWith({ postId: 'author:post123' });
      expect(result).toEqual(mockPostDetails);
    });

    it('should return null when post not found in Nexus', async () => {
      const mockViewerId = 'test-viewer-id' as Pubky;
      const readSpyFirst = vi.spyOn(LocalPostService, 'readDetails').mockResolvedValueOnce(null);
      const fetchMissingSpy = vi
        .spyOn(PostStreamApplication, 'fetchMissingPostsFromNexus')
        .mockResolvedValue(undefined);
      const readSpySecond = vi.spyOn(LocalPostService, 'readDetails').mockResolvedValueOnce(null);

      const result = await PostApplication.getOrFetch({
        compositeId: 'author:post123',
        viewerId: mockViewerId,
      });

      expect(readSpyFirst).toHaveBeenCalledWith({ postId: 'author:post123' });
      expect(fetchMissingSpy).toHaveBeenCalledWith({
        cacheMissPostIds: ['author:post123'],
        viewerId: mockViewerId,
      });
      expect(readSpySecond).toHaveBeenCalledWith({ postId: 'author:post123' });
      expect(result).toBeNull();
    });
  });

  describe('fetch', () => {
    const mockPostDetails: PostDetailsModelSchema = {
      id: 'author:post123',
      content: 'Test post',
      kind: 'short',
      uri: 'pubky://author/pub/pubky.app/posts/post123',
      indexed_at: Date.now(),
      attachments: null,
    };

    it('should fetch post from Nexus and return persisted data', async () => {
      const mockViewerId = 'test-viewer-id' as Pubky;
      const fetchMissingSpy = vi
        .spyOn(PostStreamApplication, 'fetchMissingPostsFromNexus')
        .mockResolvedValue(undefined);
      const readSpy = vi.spyOn(LocalPostService, 'readDetails').mockResolvedValueOnce(mockPostDetails);

      const result = await PostApplication.fetch({
        compositeId: 'author:post123',
        viewerId: mockViewerId,
      });

      expect(fetchMissingSpy).toHaveBeenCalledWith({
        cacheMissPostIds: ['author:post123'],
        viewerId: mockViewerId,
      });
      expect(readSpy).toHaveBeenCalledTimes(1);
      expect(readSpy).toHaveBeenCalledWith({ postId: 'author:post123' });
      expect(result).toEqual(mockPostDetails);
    });

    it('should return null when post not found on Nexus', async () => {
      const mockViewerId = 'test-viewer-id' as Pubky;
      const fetchMissingSpy = vi
        .spyOn(PostStreamApplication, 'fetchMissingPostsFromNexus')
        .mockResolvedValue(undefined);
      const readSpy = vi.spyOn(LocalPostService, 'readDetails').mockResolvedValueOnce(null);

      const result = await PostApplication.fetch({
        compositeId: 'author:post123',
        viewerId: mockViewerId,
      });

      expect(fetchMissingSpy).toHaveBeenCalledWith({
        cacheMissPostIds: ['author:post123'],
        viewerId: mockViewerId,
      });
      expect(readSpy).toHaveBeenCalledTimes(1);
      expect(readSpy).toHaveBeenCalledWith({ postId: 'author:post123' });
      expect(result).toBeNull();
    });

    it('should propagate errors from PostStreamApplication', async () => {
      const mockViewerId = 'test-viewer-id' as Pubky;
      vi.spyOn(PostStreamApplication, 'fetchMissingPostsFromNexus').mockRejectedValue(new Error('Nexus error'));

      await expect(
        PostApplication.fetch({
          compositeId: 'author:post123',
          viewerId: mockViewerId,
        }),
      ).rejects.toThrow('Nexus error');
    });
  });

  describe('getCounts', () => {
    it('should call LocalPostService.readCounts', async () => {
      const mockCounts: PostCountsModelSchema = {
        id: 'author:post123',
        tags: 5,
        unique_tags: 3,
        replies: 10,
        reposts: 2,
      };

      const getCountsSpy = vi.spyOn(LocalPostService, 'readCounts').mockResolvedValue(mockCounts);

      const result = await PostApplication.getCounts({ compositeId: 'author:post123' });

      expect(getCountsSpy).toHaveBeenCalledWith('author:post123');
      expect(result).toEqual(mockCounts);
    });
  });

  describe('getTags', () => {
    it('should call LocalPostService.readTags', async () => {
      const mockTags: TagCollectionModelSchema<string>[] = [
        {
          id: 'author:post123',
          tags: [{ label: 'tag1', taggers: ['test-viewer-id'] as Pubky[], taggers_count: 0, relationship: false }],
        },
      ];

      const getTagsSpy = vi.spyOn(LocalPostService, 'readTags').mockResolvedValue(mockTags);

      const result = await PostApplication.getTags({ compositeId: 'author:post123' });

      expect(getTagsSpy).toHaveBeenCalledWith('author:post123');
      expect(result).toEqual(mockTags);
    });
  });

  describe('getRelationships', () => {
    it('should call LocalPostService.readRelationships', async () => {
      const mockRelationships: PostRelationshipsModelSchema = {
        id: 'author:post123',
        replied: 'pubky://parent/pub/pubky.app/posts/parent123',
        reposted: null,
        mentioned: [],
      };

      const getRelationshipsSpy = vi.spyOn(LocalPostService, 'readRelationships').mockResolvedValue(mockRelationships);

      const result = await PostApplication.getRelationships({ compositeId: 'author:post123' });

      expect(getRelationshipsSpy).toHaveBeenCalledWith('author:post123');
      expect(result).toEqual(mockRelationships);
    });

    it('should return null when relationships do not exist', async () => {
      const getRelationshipsSpy = vi.spyOn(LocalPostService, 'readRelationships').mockResolvedValue(null);

      const result = await PostApplication.getRelationships({ compositeId: 'nonexistent:post' });

      expect(getRelationshipsSpy).toHaveBeenCalledWith('nonexistent:post');
      expect(result).toBeNull();
    });
  });

  describe('getDetails', () => {
    it('should call LocalPostService.readDetails and enrich with moderation', async () => {
      const mockPost: PostDetailsModelSchema = {
        id: 'author:post123',
        content: 'Test post',
        indexed_at: Date.now(),
        kind: 'short',
        uri: 'pubky://author/pub/pubky.app/posts/post123',
        attachments: null,
      };

      const readSpy = vi.spyOn(LocalPostService, 'readDetails').mockResolvedValue(mockPost);

      const result = await PostApplication.getDetails({ compositeId: 'author:post123' });

      expect(readSpy).toHaveBeenCalledWith({ postId: 'author:post123' });
      expect(result).toEqual({
        ...mockPost,
        is_moderated: false,
        is_blurred: false,
      });
    });

    it('should return null when post does not exist', async () => {
      const readSpy = vi.spyOn(LocalPostService, 'readDetails').mockResolvedValue(null);

      const result = await PostApplication.getDetails({ compositeId: 'nonexistent:post' });

      expect(readSpy).toHaveBeenCalledWith({ postId: 'nonexistent:post' });
      expect(result).toBeNull();
    });
  });

  describe('fetchTaggers', () => {
    it('should delegate to NexusPostService.getPostTaggers', async () => {
      const params: TFetchPostTaggersParams = {
        compositeId: 'author:post123',
        label: 'bitcoin',
        skip: 10,
        limit: 20,
      };
      const mockTaggers: NexusTaggers = { relationship: false, users: ['user1' as Pubky] };
      const taggersSpy = vi.spyOn(NexusPostService, 'getPostTaggers').mockResolvedValue(mockTaggers);

      const result = await PostApplication.fetchTaggers(params);

      expect(taggersSpy).toHaveBeenCalledWith(params);
      expect(result).toEqual(mockTaggers);
    });

    it('should propagate errors from NexusPostService.getPostTaggers', async () => {
      const params: TFetchPostTaggersParams = {
        compositeId: 'author:post123',
        label: 'bitcoin',
      };
      const taggersSpy = vi.spyOn(NexusPostService, 'getPostTaggers').mockRejectedValue(new Error('Nexus failed'));

      await expect(PostApplication.fetchTaggers(params)).rejects.toThrow('Nexus failed');
      expect(taggersSpy).toHaveBeenCalledWith(params);
    });
  });

  describe('commitEdit', () => {
    const mockPostDetails: PostDetailsModelSchema = {
      id: 'author:post123',
      content: 'Original content',
      kind: 'short',
      uri: 'pubky://author/pub/pubky.app/posts/post123',
      indexed_at: Date.now(),
      attachments: null,
    };

    const createMockEditInput = (): TEditPostInput => {
      const mockPost = new PubkyAppPost('Edited content', PubkyAppPostKind.Short, undefined, undefined, undefined);
      return {
        compositePostId: 'author:post123',
        post: mockPost,
        postUrl: 'pubky://author/pub/pubky.app/posts/post123',
      };
    };

    const setupEditSpies = () => ({
      readDetailsSpy: vi.spyOn(LocalPostService, 'readDetails').mockResolvedValue(mockPostDetails),
      editSpy: vi.spyOn(LocalPostService, 'edit').mockResolvedValue(undefined),
      requestSpy: vi.spyOn(HomeserverService, 'request').mockResolvedValue(undefined),
    });

    it('should edit locally and sync to homeserver', async () => {
      const mockData = createMockEditInput();
      const { readDetailsSpy, editSpy, requestSpy } = setupEditSpies();

      await PostApplication.commitEdit(mockData);

      expect(readDetailsSpy).toHaveBeenCalledWith({ postId: mockData.compositePostId });
      expect(editSpy).toHaveBeenCalledWith({ compositePostId: mockData.compositePostId, content: 'Edited content' });
      expect(requestSpy).toHaveBeenCalledWith({
        method: HttpMethod.PUT,
        url: mockData.postUrl,
        bodyJson: expect.objectContaining({ content: 'Edited content', kind: 'short' }),
      });
    });

    it('should rollback local edit when homeserver sync fails', async () => {
      const mockData = createMockEditInput();
      const { readDetailsSpy, editSpy, requestSpy } = setupEditSpies();
      requestSpy.mockRejectedValue(new Error('Failed to PUT to homeserver: 401'));

      await expect(PostApplication.commitEdit(mockData)).rejects.toThrow('Failed to PUT to homeserver: 401');

      expect(readDetailsSpy).toHaveBeenCalledWith({ postId: mockData.compositePostId });
      expect(editSpy).toHaveBeenCalledTimes(2);
      expect(editSpy).toHaveBeenNthCalledWith(1, {
        compositePostId: mockData.compositePostId,
        content: 'Edited content',
      });
      expect(editSpy).toHaveBeenNthCalledWith(2, {
        compositePostId: mockData.compositePostId,
        content: 'Original content',
      });
    });

    it('should propagate original error when edit rollback also fails', async () => {
      const mockData = createMockEditInput();
      const { readDetailsSpy, editSpy, requestSpy } = setupEditSpies();
      requestSpy.mockRejectedValue(new Error('Failed to PUT to homeserver: 401'));
      editSpy.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('Rollback DB error'));

      await expect(PostApplication.commitEdit(mockData)).rejects.toThrow('Failed to PUT to homeserver: 401');

      expect(readDetailsSpy).toHaveBeenCalledWith({ postId: mockData.compositePostId });
      expect(editSpy).toHaveBeenCalledTimes(2);
    });
  });
});
