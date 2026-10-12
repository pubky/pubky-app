import { buildFile, buildPost } from 'pubky-social-specs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FileApplication } from '@/application/file/file';
import { PostApplication } from '@/application/post/post';
import type { TCreatePostInput, TEditPostInput } from '@/application/post/post.types';
import { PostStreamApplication } from '@/application/stream/posts/post';
import { TagApplication } from '@/application/tag/tag';
import { TagKind, type TCreateTagInput } from '@/application/tag/tag.types';
import { NEXUS_STREAM_MAX_LIMIT } from '@/config/nexus';
import type { TFetchPostTaggersParams } from '@/controllers/post/post.types';
import { DatabaseErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import type { Pubky } from '@/models/models.types';
import type { PostCountsModelSchema } from '@/models/post/counts/postCounts.schema';
import { PostDetailsModel } from '@/models/post/details/postDetails';
import type { PostDetailsModelSchema } from '@/models/post/details/postDetails.schema';
import type { PostRelationshipsModelSchema } from '@/models/post/relationships/postRelationships.schema';
import type { TFileAttachmentResult } from '@/pipes/file/file.types';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { LocalPostService } from '@/services/local/post/post';
import { LocalStreamPostsService } from '@/services/local/stream/posts/posts';
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
    removeFromKindStreams: vi.fn(),
    readDetails: vi.fn(),
    readDetailsByIds: vi.fn(),
    readCounts: vi.fn(),
    readRelationships: vi.fn(),
    readRelationshipsByIds: vi.fn(),
  },
}));

vi.mock('@/services/local/stream/posts/posts', () => ({
  LocalStreamPostsService: {
    read: vi.fn(),
  },
}));

vi.mock('@/services/local/tag/post/tag.post', () => ({
  LocalPostTagService: {},
}));

// Mock the HomeserverService
vi.mock('@/services/homeserver/homeserver', () => ({
  HomeserverService: {
    request: vi.fn(),
    putBlob: vi.fn(),
    getBytes: vi.fn(),
    listAll: vi.fn(),
    exists: vi.fn(),
    deleteIdempotent: vi.fn(),
  },
}));

// Mock the FileApplication
vi.mock('@/application/file/file', () => ({
  FileApplication: {
    commitCreate: vi.fn(),
    commitDelete: vi.fn(),
    commitDeleteUploaded: vi.fn(),
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
  const AUTHOR = 'pxnu33x7jtpx9ar1ytsi4yxbp6a5o36gwhffs8zoxmbuptici1jy' as Pubky;

  /** A post built by the package, as the controller hands it over. */
  const builtPost = (content: string, kind: 'note' | 'article' = 'note', parent?: string) =>
    kind === 'article'
      ? buildPost(AUTHOR, { kind, title: 'Title', body: content })
      : buildPost(AUTHOR, { content, parent: parent ?? null });

  const createMockPostData = (): TCreatePostInput => ({
    compositePostId: 'author:post123',
    post: builtPost('Hello, world!'),
  });

  const createMockFileAttachment = (id: string = 'file1'): TFileAttachmentResult => {
    const bytes = new TextEncoder().encode(id);
    return {
      media: buildFile(AUTHOR, { bytes, type: 'image/png' }),
      bytes,
      name: `${id}.png`,
      contentType: 'image/png',
    };
  };

  const createMockTag = (id: string, label: string = 'test-tag'): TCreateTagInput => ({
    taggerId: 'author' as Pubky,
    taggedId: id,
    label,
    taggedKind: TagKind.POST,
    tagUrl: `pubky://author/pub/pubky.app/tags/${label}`,
    tagBody: new TextEncoder().encode(`{"label":"${label}"}`),
  });

  // Spy setup helpers
  const setupBasicSpies = () => ({
    saveSpy: vi.spyOn(LocalPostService, 'create').mockResolvedValue(undefined),
    deleteSpy: vi.spyOn(LocalPostService, 'delete').mockResolvedValue(false),
    requestSpy: vi.spyOn(HomeserverService, 'putBlob').mockResolvedValue(undefined),
  });

  const setupCreateSpies = () => ({
    commitCreateSpy: vi.spyOn(FileApplication, 'commitCreate').mockResolvedValue(undefined),
    saveSpy: vi.spyOn(LocalPostService, 'create').mockResolvedValue(undefined),
    requestSpy: vi.spyOn(HomeserverService, 'putBlob').mockResolvedValue(undefined),
    tagCreateSpy: vi.spyOn(TagApplication, 'commitCreate').mockResolvedValue(undefined),
  });

  const setupDeleteSpies = (stored: ReturnType<typeof buildPost>) => {
    // One public version of the post, and no 0.x copy
    vi.mocked(HomeserverService.listAll).mockImplementation(async ({ baseDirectory }) =>
      baseDirectory.includes('/pub/social/v1/posts/') ? [stored.url] : [],
    );
    vi.mocked(HomeserverService.getBytes).mockResolvedValue(stored.body);
    vi.mocked(HomeserverService.exists).mockResolvedValue(false);
    return {
      findByIdSpy: vi.spyOn(PostDetailsModel, 'findById'),
      deleteSpy: vi.spyOn(LocalPostService, 'delete'),
      requestSpy: vi.spyOn(HomeserverService, 'deleteIdempotent').mockResolvedValue(undefined),
      fileCommitDeleteSpy: vi.spyOn(FileApplication, 'commitDelete').mockResolvedValue(undefined),
    };
  };

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
      expect(requestSpy).toHaveBeenCalledWith({ url: mockData.post.url, blob: mockData.post.body });
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
      const longPost = builtPost('Long post content', 'article');
      const mockData: TCreatePostInput = {
        compositePostId: 'author:post456',
        post: longPost,
      };
      const { saveSpy, requestSpy } = setupBasicSpies();

      await PostApplication.commitCreate(mockData);

      expect(saveSpy).toHaveBeenCalledWith({
        compositePostId: mockData.compositePostId,
        post: longPost,
      });
      expect(requestSpy).toHaveBeenCalledWith({ url: mockData.post.url, blob: mockData.post.body });
    });

    it('should handle posts with parent URI (reply)', async () => {
      const replyPost = builtPost(
        'Reply content',
        'note',
        'pubky://o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo/pub/social/v1/posts/0032PARTQP4G0',
      );
      const mockData: TCreatePostInput = {
        compositePostId: 'author:post789',
        post: replyPost,
      };
      const { saveSpy, requestSpy } = setupBasicSpies();

      await PostApplication.commitCreate(mockData);

      expect(saveSpy).toHaveBeenCalledWith({
        compositePostId: mockData.compositePostId,
        post: replyPost,
      });
      expect(requestSpy).toHaveBeenCalledWith({ url: mockData.post.url, blob: mockData.post.body });
    });

    // --- File Attachments ---
    describe('with file attachments', () => {
      it('should upload files before saving post locally', async () => {
        const mockFileAttachments = [createMockFileAttachment('file1')];

        const mockPost = builtPost('Post with image');
        const mockData: TCreatePostInput = {
          compositePostId: 'author:post-with-files',
          post: mockPost,
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
        expect(requestSpy).toHaveBeenCalledWith({ url: mockData.post.url, blob: mockData.post.body });
      });

      it('should fail fast on file upload error', async () => {
        const mockFileAttachments = [createMockFileAttachment('file2')];

        const mockPost = builtPost('Post with video');
        const mockData: TCreatePostInput = {
          compositePostId: 'author:post-with-video',
          post: mockPost,
          fileAttachments: mockFileAttachments,
        };

        const { commitCreateSpy, saveSpy, requestSpy } = setupCreateSpies();
        const fileDeleteUploadedSpy = vi.spyOn(FileApplication, 'commitDeleteUploaded').mockResolvedValue(undefined);
        commitCreateSpy.mockRejectedValue(new Error('File upload failed: quota exceeded'));

        await expect(PostApplication.commitCreate(mockData)).rejects.toThrow('File upload failed: quota exceeded');

        expect(commitCreateSpy).toHaveBeenCalledWith({ fileAttachments: mockFileAttachments });
        // A half-uploaded file (blob in, record missing) is swept by its known URLs
        expect(fileDeleteUploadedSpy).toHaveBeenCalledWith(mockFileAttachments);
        expect(saveSpy).not.toHaveBeenCalled();
        expect(requestSpy).not.toHaveBeenCalled();
      });

      it('should roll back the whole batch when one upload of several fails', async () => {
        // An article sends its cover and body files together; the uploads run in
        // parallel, so the siblings of the failed one are already on the homeserver
        const mockFileAttachments = [
          createMockFileAttachment('cover'),
          createMockFileAttachment('body-1'),
          createMockFileAttachment('body-2'),
        ];

        const mockPost = new PubkyAppPost('Article', PubkyAppPostKind.Long, undefined, undefined, undefined);
        const mockData: TCreatePostInput = {
          compositePostId: 'author:article-partial-upload',
          post: mockPost,
          postUrl: 'pubky://author/pub/pubky.app/posts/article-partial-upload',
          fileAttachments: mockFileAttachments,
        };

        const { commitCreateSpy, saveSpy, requestSpy } = setupCreateSpies();
        const fileDeleteUploadedSpy = vi.spyOn(FileApplication, 'commitDeleteUploaded').mockResolvedValue(undefined);
        commitCreateSpy.mockRejectedValue(new Error('File upload failed: 507'));

        await expect(PostApplication.commitCreate(mockData)).rejects.toThrow('File upload failed: 507');

        expect(fileDeleteUploadedSpy).toHaveBeenCalledWith(mockFileAttachments);
        expect(saveSpy).not.toHaveBeenCalled();
        expect(requestSpy).not.toHaveBeenCalled();
      });

      it('should roll back the uploads when the local post write fails', async () => {
        const mockFileAttachments = [createMockFileAttachment('cover'), createMockFileAttachment('body-1')];

        const mockPost = new PubkyAppPost('Article', PubkyAppPostKind.Long, undefined, undefined, undefined);
        const mockData: TCreatePostInput = {
          compositePostId: 'author:article-local-write-fail',
          post: mockPost,
          postUrl: 'pubky://author/pub/pubky.app/posts/article-local-write-fail',
          fileAttachments: mockFileAttachments,
        };

        const { commitCreateSpy, saveSpy, requestSpy } = setupCreateSpies();
        const fileDeleteUploadedSpy = vi.spyOn(FileApplication, 'commitDeleteUploaded').mockResolvedValue(undefined);
        saveSpy.mockRejectedValue(new Error('Dexie write failed'));

        await expect(PostApplication.commitCreate(mockData)).rejects.toThrow('Dexie write failed');

        expect(commitCreateSpy).toHaveBeenCalledWith({ fileAttachments: mockFileAttachments });
        expect(fileDeleteUploadedSpy).toHaveBeenCalledWith(mockFileAttachments);
        expect(requestSpy).not.toHaveBeenCalled();
      });

      it('should propagate the upload error when the batch rollback also fails', async () => {
        const mockFileAttachments = [createMockFileAttachment('cover'), createMockFileAttachment('body-1')];

        const mockPost = new PubkyAppPost('Article', PubkyAppPostKind.Long, undefined, undefined, undefined);
        const mockData: TCreatePostInput = {
          compositePostId: 'author:article-rollback-fail',
          post: mockPost,
          postUrl: 'pubky://author/pub/pubky.app/posts/article-rollback-fail',
          fileAttachments: mockFileAttachments,
        };

        const { commitCreateSpy, saveSpy } = setupCreateSpies();
        const fileDeleteUploadedSpy = vi
          .spyOn(FileApplication, 'commitDeleteUploaded')
          .mockRejectedValue(new Error('File rollback failed'));
        commitCreateSpy.mockRejectedValue(new Error('File upload failed: 507'));

        await expect(PostApplication.commitCreate(mockData)).rejects.toThrow('File upload failed: 507');

        expect(fileDeleteUploadedSpy).toHaveBeenCalledWith(mockFileAttachments);
        expect(saveSpy).not.toHaveBeenCalled();
      });
    });

    // --- Tags ---
    describe('with tags', () => {
      it('should create tags after homeserver sync', async () => {
        const mockTags = [createMockTag('author:post-with-tags', 'technology')];

        const mockPost = builtPost('Post with tags');
        const mockData: TCreatePostInput = {
          compositePostId: 'author:post-with-tags',
          post: mockPost,
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
        expect(requestSpy).toHaveBeenCalledWith({ url: mockData.post.url, blob: mockData.post.body });
      });

      it('should propagate tag creation error after post sync', async () => {
        const mockTags = [createMockTag('author:post-with-tags-fail', 'science')];

        const mockPost = builtPost('Post with failing tags');
        const mockData: TCreatePostInput = {
          compositePostId: 'author:post-with-tags-fail',
          post: mockPost,
          tags: mockTags,
        };

        const { saveSpy, requestSpy, tagCreateSpy } = setupCreateSpies();
        tagCreateSpy.mockRejectedValue(new Error('Tag creation failed: database locked'));

        await expect(PostApplication.commitCreate(mockData)).rejects.toThrow('Tag creation failed: database locked');

        expect(saveSpy).toHaveBeenCalledWith({
          compositePostId: mockData.compositePostId,
          post: mockData.post,
        });
        expect(requestSpy).toHaveBeenCalledWith({ url: mockData.post.url, blob: mockData.post.body });
        expect(tagCreateSpy).toHaveBeenCalledWith({ tagList: mockTags });
      });
    });

    // --- Combined Scenarios ---
    describe('with both file attachments and tags', () => {
      it('should execute full workflow with files and tags', async () => {
        const mockFileAttachments = [createMockFileAttachment('file-combo')];
        const mockTags = [createMockTag('author:post-combo', 'photography')];

        const mockPost = builtPost('Post with files and tags');
        const mockData: TCreatePostInput = {
          compositePostId: 'author:post-combo',
          post: mockPost,
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
        expect(requestSpy).toHaveBeenCalledWith({ url: mockData.post.url, blob: mockData.post.body });
        expect(tagCreateSpy).toHaveBeenCalledWith({ tagList: mockTags });
        expect(commitCreateSpy).toHaveBeenCalledBefore(saveSpy);
        expect(saveSpy).toHaveBeenCalledBefore(requestSpy);
        expect(requestSpy).toHaveBeenCalledBefore(tagCreateSpy);
      });

      it('should rollback local write, rollback files, and skip tags when homeserver sync fails', async () => {
        const mockFileAttachments = [createMockFileAttachment('file-fail')];
        const mockTags = [createMockTag('author:post-fail', 'art')];

        const mockPost = builtPost('Post with homeserver failure');
        const mockData: TCreatePostInput = {
          compositePostId: 'author:post-fail',
          post: mockPost,
          fileAttachments: mockFileAttachments,
          tags: mockTags,
        };

        const { commitCreateSpy, saveSpy, requestSpy, tagCreateSpy } = setupCreateSpies();
        const deleteSpy = vi.spyOn(LocalPostService, 'delete').mockResolvedValue(false);
        const fileDeleteUploadedSpy = vi.spyOn(FileApplication, 'commitDeleteUploaded').mockResolvedValue(undefined);
        requestSpy.mockRejectedValue(new Error('Homeserver sync failed: 503 Service Unavailable'));

        await expect(PostApplication.commitCreate(mockData)).rejects.toThrow(
          'Homeserver sync failed: 503 Service Unavailable',
        );

        expect(commitCreateSpy).toHaveBeenCalledWith({ fileAttachments: mockFileAttachments });
        expect(saveSpy).toHaveBeenCalledWith({
          compositePostId: mockData.compositePostId,
          post: mockData.post,
        });
        expect(requestSpy).toHaveBeenCalledWith({ url: mockData.post.url, blob: mockData.post.body });
        expect(deleteSpy).toHaveBeenCalledWith({ compositePostId: mockData.compositePostId });
        // Rollback deletes by the known record + blob URLs, not by record URI
        expect(fileDeleteUploadedSpy).toHaveBeenCalledWith(mockFileAttachments);
        expect(tagCreateSpy).not.toHaveBeenCalled();
      });

      it('should propagate original error when file rollback also fails', async () => {
        const mockFileAttachments = [createMockFileAttachment('file-rollback-fail')];

        const mockPost = builtPost('Post with file rollback failure');
        const mockData: TCreatePostInput = {
          compositePostId: 'author:post-file-rollback-fail',
          post: mockPost,
          fileAttachments: mockFileAttachments,
        };

        const { commitCreateSpy, saveSpy, requestSpy } = setupCreateSpies();
        const deleteSpy = vi.spyOn(LocalPostService, 'delete').mockResolvedValue(false);
        const fileDeleteUploadedSpy = vi
          .spyOn(FileApplication, 'commitDeleteUploaded')
          .mockRejectedValue(new Error('File rollback failed'));
        requestSpy.mockRejectedValue(new Error('Homeserver sync failed: 401'));

        await expect(PostApplication.commitCreate(mockData)).rejects.toThrow('Homeserver sync failed: 401');

        expect(commitCreateSpy).toHaveBeenCalledWith({ fileAttachments: mockFileAttachments });
        expect(saveSpy).toHaveBeenCalledOnce();
        expect(deleteSpy).toHaveBeenCalledWith({ compositePostId: mockData.compositePostId });
        expect(fileDeleteUploadedSpy).toHaveBeenCalledWith(mockFileAttachments);
      });
    });
  });

  describe('commitDelete', () => {
    // The stored version a LIST of the post directory finds
    const DELETED_POST = buildPost(AUTHOR, { content: 'Test post' });
    const DELETE_ID = `${AUTHOR}:${DELETED_POST.id}`;
    const createMockDeleteData = () => ({
      compositePostId: DELETE_ID,
    });

    const mockPostDetails = {
      id: DELETE_ID,
      content: 'Test post',
      kind: 'note',
      uri: 'pubky://author/pub/pubky.app/posts/post123',
      indexed_at: Date.now(),
      attachments: null,
    };

    const mockPostDetailsWithAttachments = {
      id: DELETE_ID,
      content: 'Post with files',
      kind: 'note',
      uri: 'pubky://author/pub/pubky.app/posts/post-with-files',
      indexed_at: Date.now(),
      attachments: ['pubky://author/pub/pubky.app/files/file1', 'pubky://author/pub/pubky.app/files/file2'],
    };

    it('should fetch post, delete locally and sync to homeserver', async () => {
      const mockData = createMockDeleteData();
      const { findByIdSpy, deleteSpy, requestSpy } = setupDeleteSpies(DELETED_POST);
      findByIdSpy.mockResolvedValue(mockPostDetails);
      deleteSpy.mockResolvedValue(false);

      await PostApplication.commitDelete(mockData);

      expect(findByIdSpy).toHaveBeenCalledWith(mockData.compositePostId);
      expect(deleteSpy).toHaveBeenCalledWith({
        compositePostId: mockData.compositePostId,
      });
      expect(requestSpy).toHaveBeenCalledWith(DELETED_POST.url);
    });

    it('should throw error when post not found', async () => {
      const mockData = createMockDeleteData();
      const { findByIdSpy } = setupDeleteSpies(DELETED_POST);
      findByIdSpy.mockResolvedValue(null);

      await expect(PostApplication.commitDelete(mockData)).rejects.toThrow('Post not found');

      expect(findByIdSpy).toHaveBeenCalledWith(mockData.compositePostId);
    });

    it('should propagate error when local delete fails', async () => {
      const mockData = createMockDeleteData();
      const { findByIdSpy, deleteSpy, requestSpy } = setupDeleteSpies(DELETED_POST);
      findByIdSpy.mockResolvedValue(mockPostDetails);
      deleteSpy.mockRejectedValue(new Error('local-delete-fail'));

      await expect(PostApplication.commitDelete(mockData)).rejects.toThrow('local-delete-fail');

      expect(findByIdSpy).toHaveBeenCalledWith(mockData.compositePostId);
      expect(deleteSpy).toHaveBeenCalledWith({ compositePostId: mockData.compositePostId });
      expect(requestSpy).not.toHaveBeenCalled();
    });

    it('should propagate error when homeserver delete fails', async () => {
      const mockData = createMockDeleteData();
      const { findByIdSpy, deleteSpy, requestSpy } = setupDeleteSpies(DELETED_POST);
      findByIdSpy.mockResolvedValue(mockPostDetails);
      deleteSpy.mockResolvedValue(false);
      requestSpy.mockRejectedValue(new Error('Failed to DELETE from homeserver: 500'));

      await expect(PostApplication.commitDelete(mockData)).rejects.toThrow('Failed to DELETE from homeserver: 500');

      expect(findByIdSpy).toHaveBeenCalledWith(mockData.compositePostId);
      expect(deleteSpy).toHaveBeenCalledWith({ compositePostId: mockData.compositePostId });
      expect(requestSpy).toHaveBeenCalledWith(DELETED_POST.url);
    });

    it('should propagate database error when findById throws', async () => {
      const mockData = createMockDeleteData();
      const databaseError = Err.database(DatabaseErrorCode.QUERY_FAILED, 'Database connection failed', {
        service: ErrorService.Local,
        operation: 'findById',
        context: { compositePostId: mockData.compositePostId },
      });
      const { findByIdSpy, deleteSpy, requestSpy } = setupDeleteSpies(DELETED_POST);
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
        const { findByIdSpy, deleteSpy, requestSpy, fileCommitDeleteSpy } = setupDeleteSpies(DELETED_POST);
        findByIdSpy.mockResolvedValue(mockPostDetailsWithAttachments);
        deleteSpy.mockResolvedValue(true);

        await PostApplication.commitDelete(mockData);

        expect(findByIdSpy).toHaveBeenCalledWith(mockData.compositePostId);
        expect(deleteSpy).toHaveBeenCalledWith({
          compositePostId: mockData.compositePostId,
        });
        // Homeserver DELETE is always called, even for soft deletes
        expect(requestSpy).toHaveBeenCalledWith(DELETED_POST.url);
        // File cleanup is skipped when post has connections
        expect(fileCommitDeleteSpy).not.toHaveBeenCalled();
      });

      it('should delete from homeserver but skip file cleanup when post has connections', async () => {
        const mockData = { compositePostId: DELETE_ID };
        const postWithAttachments = {
          ...mockPostDetailsWithAttachments,
          id: DELETE_ID,
          attachments: [
            'pubky://author/pub/pubky.app/files/important-file',
            'pubky://author/pub/pubky.app/files/shared-image',
          ],
        };

        const { findByIdSpy, deleteSpy, requestSpy, fileCommitDeleteSpy } = setupDeleteSpies(DELETED_POST);
        findByIdSpy.mockResolvedValue(postWithAttachments);
        deleteSpy.mockResolvedValue(true);

        await PostApplication.commitDelete(mockData);

        expect(findByIdSpy).toHaveBeenCalledWith(mockData.compositePostId);
        expect(deleteSpy).toHaveBeenCalledWith({ compositePostId: mockData.compositePostId });
        // Always sync deletion to homeserver (Nexus determines definitive state)
        expect(requestSpy).toHaveBeenCalledWith(DELETED_POST.url);
        // Files are preserved when post has connections (soft delete)
        expect(fileCommitDeleteSpy).not.toHaveBeenCalled();
      });
    });

    // --- File Attachment Deletion ---
    describe('with file attachments (hadConnections = false)', () => {
      it('should delete files after homeserver deletion', async () => {
        const mockData = { compositePostId: DELETE_ID };
        const postWithFiles = {
          id: DELETE_ID,
          content: 'Post with files to delete',
          kind: 'note',
          uri: 'pubky://author/pub/pubky.app/posts/post-with-files-delete',
          indexed_at: Date.now(),
          attachments: ['pubky://author/pub/pubky.app/files/file1', 'pubky://author/pub/pubky.app/files/file2'],
        };

        const { findByIdSpy, deleteSpy, requestSpy, fileCommitDeleteSpy } = setupDeleteSpies(DELETED_POST);
        findByIdSpy.mockResolvedValue(postWithFiles);
        deleteSpy.mockResolvedValue(false);

        await PostApplication.commitDelete(mockData);

        expect(findByIdSpy).toHaveBeenCalledWith(mockData.compositePostId);
        expect(deleteSpy).toHaveBeenCalledWith({ compositePostId: mockData.compositePostId });
        expect(requestSpy).toHaveBeenCalledWith(DELETED_POST.url);
        expect(fileCommitDeleteSpy).toHaveBeenCalledWith(postWithFiles.attachments, DELETE_ID);
        expect(requestSpy).toHaveBeenCalledBefore(fileCommitDeleteSpy);
      });

      it('should skip file cleanup when no attachments', async () => {
        const mockData = { compositePostId: DELETE_ID };
        const postWithoutFiles = {
          id: DELETE_ID,
          content: 'Post without files',
          kind: 'note',
          uri: 'pubky://author/pub/pubky.app/posts/post-no-files',
          indexed_at: Date.now(),
          attachments: null,
        };

        const { findByIdSpy, deleteSpy, requestSpy, fileCommitDeleteSpy } = setupDeleteSpies(DELETED_POST);
        findByIdSpy.mockResolvedValue(postWithoutFiles);
        deleteSpy.mockResolvedValue(false);

        await PostApplication.commitDelete(mockData);

        expect(findByIdSpy).toHaveBeenCalledWith(mockData.compositePostId);
        expect(deleteSpy).toHaveBeenCalledWith({ compositePostId: mockData.compositePostId });
        expect(requestSpy).toHaveBeenCalledWith(DELETED_POST.url);
        expect(fileCommitDeleteSpy).not.toHaveBeenCalled();
      });

      it('should not fail the delete when file cleanup fails (best-effort)', async () => {
        const mockData = { compositePostId: DELETE_ID };
        const postWithFiles = {
          id: DELETE_ID,
          content: 'Post with file deletion failure',
          kind: 'note',
          uri: 'pubky://author/pub/pubky.app/posts/post-file-delete-fail',
          indexed_at: Date.now(),
          attachments: ['pubky://author/pub/pubky.app/files/stubborn-file'],
        };

        const { findByIdSpy, deleteSpy, requestSpy, fileCommitDeleteSpy } = setupDeleteSpies(DELETED_POST);
        findByIdSpy.mockResolvedValue(postWithFiles);
        deleteSpy.mockResolvedValue(false);
        fileCommitDeleteSpy.mockRejectedValue(new Error('File deletion failed: permission denied'));

        // The post delete already succeeded on the homeserver — file cleanup
        // failures are logged and swallowed (files may already be gone, e.g.
        // deleted by an earlier edit whose Nexus state was reverted locally)
        await expect(PostApplication.commitDelete(mockData)).resolves.toBeUndefined();

        expect(findByIdSpy).toHaveBeenCalledWith(mockData.compositePostId);
        expect(deleteSpy).toHaveBeenCalledWith({ compositePostId: mockData.compositePostId });
        expect(requestSpy).toHaveBeenCalledWith(DELETED_POST.url);
        expect(fileCommitDeleteSpy).toHaveBeenCalledWith(postWithFiles.attachments, DELETE_ID);
      });
    });

    // --- Collection cover cleanup ---
    describe('with collection cover_image', () => {
      const coverUri = 'pubky://author/pub/pubky.app/files/collection-cover';

      it('deletes the homeserver cover after deleting a collection', async () => {
        const mockData = { compositePostId: DELETE_ID };
        const collectionPost = {
          id: DELETE_ID,
          content: JSON.stringify({
            name: 'My collection',
            description: '',
            items: [],
            cover_image: coverUri,
          }),
          kind: 'collection',
          uri: 'pubky://author/pub/pubky.app/posts/collection-with-cover',
          indexed_at: Date.now(),
          attachments: null,
        };

        const { findByIdSpy, deleteSpy, requestSpy, fileCommitDeleteSpy } = setupDeleteSpies(DELETED_POST);
        findByIdSpy.mockResolvedValue(collectionPost);
        deleteSpy.mockResolvedValue(false);

        await PostApplication.commitDelete(mockData);

        expect(requestSpy).toHaveBeenCalledWith(DELETED_POST.url);
        expect(fileCommitDeleteSpy).toHaveBeenCalledWith([coverUri], DELETE_ID);
        expect(requestSpy).toHaveBeenCalledBefore(fileCommitDeleteSpy);
      });

      it('deletes the collection cover even when the post has connections (soft delete)', async () => {
        const mockData = { compositePostId: DELETE_ID };
        const collectionPost = {
          id: DELETE_ID,
          content: JSON.stringify({
            name: 'Soft-deleted collection',
            items: [],
            cover_image: coverUri,
          }),
          kind: 'collection',
          uri: 'pubky://author/pub/pubky.app/posts/collection-soft-delete',
          indexed_at: Date.now(),
          attachments: null,
        };

        const { findByIdSpy, deleteSpy, requestSpy, fileCommitDeleteSpy } = setupDeleteSpies(DELETED_POST);
        findByIdSpy.mockResolvedValue(collectionPost);
        deleteSpy.mockResolvedValue(true);

        await PostApplication.commitDelete(mockData);

        expect(requestSpy).toHaveBeenCalledWith(DELETED_POST.url);
        expect(fileCommitDeleteSpy).toHaveBeenCalledWith([coverUri], DELETE_ID);
      });

      it('does not delete an external https collection cover', async () => {
        const mockData = { compositePostId: DELETE_ID };
        const collectionPost = {
          id: DELETE_ID,
          content: JSON.stringify({
            name: 'External cover',
            items: [],
            cover_image: 'https://example.com/cover.png',
          }),
          kind: 'collection',
          uri: 'pubky://author/pub/pubky.app/posts/collection-https-cover',
          indexed_at: Date.now(),
          attachments: null,
        };

        const { findByIdSpy, deleteSpy, requestSpy, fileCommitDeleteSpy } = setupDeleteSpies(DELETED_POST);
        findByIdSpy.mockResolvedValue(collectionPost);
        deleteSpy.mockResolvedValue(false);

        await PostApplication.commitDelete(mockData);

        expect(requestSpy).toHaveBeenCalledWith(DELETED_POST.url);
        expect(fileCommitDeleteSpy).not.toHaveBeenCalled();
      });

      it('does not attempt cover cleanup for non-collection posts', async () => {
        const mockData = { compositePostId: DELETE_ID };
        const shortPost = {
          id: DELETE_ID,
          content: JSON.stringify({
            name: 'Not a collection',
            cover_image: coverUri,
          }),
          kind: 'short',
          uri: 'pubky://author/pub/pubky.app/posts/short-post',
          indexed_at: Date.now(),
          attachments: null,
        };

        const { findByIdSpy, deleteSpy, requestSpy, fileCommitDeleteSpy } = setupDeleteSpies(DELETED_POST);
        findByIdSpy.mockResolvedValue(shortPost);
        deleteSpy.mockResolvedValue(false);

        await PostApplication.commitDelete(mockData);

        expect(requestSpy).toHaveBeenCalledWith(DELETED_POST.url);
        expect(fileCommitDeleteSpy).not.toHaveBeenCalled();
      });

      it('does not fail the delete when cover cleanup fails', async () => {
        const mockData = { compositePostId: DELETE_ID };
        const collectionPost = {
          id: DELETE_ID,
          content: JSON.stringify({
            name: 'Cleanup fail',
            items: [],
            cover_image: coverUri,
          }),
          kind: 'collection',
          uri: 'pubky://author/pub/pubky.app/posts/collection-cover-cleanup-fail',
          indexed_at: Date.now(),
          attachments: null,
        };

        const { findByIdSpy, deleteSpy, requestSpy, fileCommitDeleteSpy } = setupDeleteSpies(DELETED_POST);
        findByIdSpy.mockResolvedValue(collectionPost);
        deleteSpy.mockResolvedValue(false);
        fileCommitDeleteSpy.mockRejectedValue(new Error('cover cleanup failed'));

        await expect(PostApplication.commitDelete(mockData)).resolves.toBeUndefined();

        expect(requestSpy).toHaveBeenCalledWith(DELETED_POST.url);
        expect(fileCommitDeleteSpy).toHaveBeenCalledWith([coverUri], DELETE_ID);
      });
    });

    // --- Edge Cases ---
    describe('edge cases with empty arrays', () => {
      it('should skip tag creation with empty array', async () => {
        const mockPost = builtPost('Post with empty tags');
        const mockData: TCreatePostInput = {
          compositePostId: DELETE_ID,
          post: mockPost,
          tags: [],
        };

        const { saveSpy, requestSpy, tagCreateSpy } = setupCreateSpies();

        await PostApplication.commitCreate(mockData);

        expect(saveSpy).toHaveBeenCalledWith({
          compositePostId: mockData.compositePostId,
          post: mockData.post,
        });
        expect(requestSpy).toHaveBeenCalledWith({ url: mockData.post.url, blob: mockData.post.body });
        expect(tagCreateSpy).not.toHaveBeenCalled();
      });

      it('should skip file upload with empty array', async () => {
        const mockPost = builtPost('Post with empty files');
        const mockData: TCreatePostInput = {
          compositePostId: DELETE_ID,
          post: mockPost,
          fileAttachments: [],
        };

        const { commitCreateSpy, saveSpy, requestSpy } = setupCreateSpies();

        await PostApplication.commitCreate(mockData);

        expect(commitCreateSpy).not.toHaveBeenCalled();
        expect(saveSpy).toHaveBeenCalledWith({
          compositePostId: mockData.compositePostId,
          post: mockData.post,
        });
        expect(requestSpy).toHaveBeenCalledWith({ url: mockData.post.url, blob: mockData.post.body });
      });

      it('should handle empty files and tags', async () => {
        const mockPost = builtPost('Post with all empty arrays');
        const mockData: TCreatePostInput = {
          compositePostId: DELETE_ID,
          post: mockPost,
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
        expect(requestSpy).toHaveBeenCalledWith({ url: mockData.post.url, blob: mockData.post.body });
      });

      it('should skip cleanup with empty attachments', async () => {
        const mockData = { compositePostId: DELETE_ID };
        const postWithEmptyAttachments = {
          id: DELETE_ID,
          content: 'Post with empty attachments array',
          kind: 'note',
          uri: 'pubky://author/pub/pubky.app/posts/post-empty-attachments',
          indexed_at: Date.now(),
          attachments: [],
        };

        const { findByIdSpy, deleteSpy, requestSpy, fileCommitDeleteSpy } = setupDeleteSpies(DELETED_POST);
        findByIdSpy.mockResolvedValue(postWithEmptyAttachments);
        deleteSpy.mockResolvedValue(false);

        await PostApplication.commitDelete(mockData);

        expect(findByIdSpy).toHaveBeenCalledWith(mockData.compositePostId);
        expect(deleteSpy).toHaveBeenCalledWith({ compositePostId: mockData.compositePostId });
        expect(requestSpy).toHaveBeenCalledWith(DELETED_POST.url);
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
      const fetchMissingSpy = vi.spyOn(PostStreamApplication, 'fetchMissingPostsFromNexus').mockResolvedValue(true);
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
      const fetchMissingSpy = vi.spyOn(PostStreamApplication, 'fetchMissingPostsFromNexus').mockResolvedValue(true);
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
      const fetchMissingSpy = vi.spyOn(PostStreamApplication, 'fetchMissingPostsFromNexus').mockResolvedValue(true);
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
      const fetchMissingSpy = vi.spyOn(PostStreamApplication, 'fetchMissingPostsFromNexus').mockResolvedValue(true);
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

  describe('getAuthoredCollections', () => {
    // Regression: after the `LocalPostService.delete` tombstone refactor, a
    // soft-deleted collection has `content === '[DELETED]'` but `kind ===
    // 'collection'`. Without an explicit `isPostDeleted` guard it would slip
    // past the kind filter and only get dropped later by
    // `CollectionPostContent.parse` failing on `[DELETED]` — fragile, since a
    // future parser change could let it through and leak deleted collections
    // into the post-save picker.
    it('excludes tombstoned collections from the returned list', async () => {
      const authorId = asOpaque<Pubky>('author-1');
      const liveId = 'author-1:live';
      const tombstonedId = 'author-1:tombstoned';
      vi.mocked(LocalStreamPostsService.read).mockResolvedValue({
        streamId: `${authorId}:author:collection`,
        stream: [liveId, tombstonedId],
      } as never);
      vi.mocked(LocalPostService.readDetailsByIds).mockResolvedValue([
        {
          id: liveId,
          content: JSON.stringify({ name: 'Live collection', items: [] }),
          kind: 'collection',
          uri: '',
          indexed_at: 0,
          attachments: null,
        },
        {
          id: tombstonedId,
          content: '[DELETED]',
          kind: 'collection',
          uri: '',
          indexed_at: 0,
          attachments: null,
        },
      ]);

      const result = await PostApplication.getAuthoredCollections({ authorId });

      expect(result).toHaveLength(1);
      expect(result?.[0].details.id).toBe(liveId);
    });
  });

  describe('fetchAuthoredCollections', () => {
    // Regression: Nexus rejects any stream `limit` above 50 with
    // "limit exceeds maximum of 50". A previous hardcoded `limit: 100` made
    // every collections fetch fail, so the post-save picker rendered no
    // collections. Pin the request to the Nexus cap so it can't regress.
    it('requests the collections stream slice within the Nexus limit cap', async () => {
      const authorId = asOpaque<Pubky>('author-1');
      const viewerId = asOpaque<Pubky>('viewer-1');
      const fetchSliceSpy = vi
        .spyOn(PostStreamApplication, 'fetchStreamSlice')
        .mockResolvedValue({ cacheMissPostIds: [] } as never);
      vi.spyOn(PostApplication, 'getAuthoredCollections').mockResolvedValue([]);

      await PostApplication.fetchAuthoredCollections({ authorId, viewerId });

      expect(fetchSliceSpy).toHaveBeenCalledTimes(1);
      const sliceArgs = fetchSliceSpy.mock.calls[0][0];
      expect(sliceArgs.limit).toBe(NEXUS_STREAM_MAX_LIMIT);
      expect(sliceArgs.limit).toBeLessThanOrEqual(50);
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

  describe('getRelationshipsByIds', () => {
    it('should delegate to LocalPostService.readRelationshipsByIds', async () => {
      const compositeIds = ['author:post1', 'author:post2'];
      const relationships: (PostRelationshipsModelSchema | undefined)[] = [
        { id: 'author:post1', replied: null, reposted: null, mentioned: [] },
        undefined,
      ];
      const readSpy = vi.spyOn(LocalPostService, 'readRelationshipsByIds').mockResolvedValue(relationships);

      const result = await PostApplication.getRelationshipsByIds({ compositeIds });

      expect(readSpy).toHaveBeenCalledWith(compositeIds);
      expect(result).toBe(relationships);
    });
  });

  describe('getDetailsByIds', () => {
    it('should delegate to LocalPostService.readDetailsByIds', async () => {
      const compositeIds = ['author:post1', 'author:post2'];
      const details: (PostDetailsModelSchema | undefined)[] = [
        {
          id: 'author:post1',
          content: 'one',
          indexed_at: Date.now(),
          kind: 'short',
          uri: 'pubky://author/pub/pubky.app/posts/post1',
          attachments: null,
        },
        undefined,
      ];
      const readSpy = vi.spyOn(LocalPostService, 'readDetailsByIds').mockResolvedValue(details);

      const result = await PostApplication.getDetailsByIds({ compositeIds });

      expect(readSpy).toHaveBeenCalledWith(compositeIds);
      expect(result).toBe(details);
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
    // The newest stored version, which the edit applies to
    const HEAD = buildPost(AUTHOR, { content: 'Original content' });
    const EDIT_ID = `${AUTHOR}:${HEAD.id}`;
    const nextVersionPut = { url: expect.stringContaining(`/posts/${HEAD.id}/`), blob: expect.anything() };
    const mockPostDetails: PostDetailsModelSchema = {
      id: EDIT_ID,
      content: 'Original content',
      kind: 'short',
      uri: 'pubky://author/pub/pubky.app/posts/post123',
      indexed_at: Date.now(),
      attachments: null,
    };

    const createMockEditInput = (): TEditPostInput => ({
      compositePostId: EDIT_ID,
      edit: { content: 'Edited content' },
    });

    const setupEditSpies = () => ({
      readDetailsSpy: vi.spyOn(LocalPostService, 'readDetails').mockResolvedValue(mockPostDetails),
      editSpy: vi.spyOn(LocalPostService, 'edit').mockResolvedValue(undefined),
      requestSpy: vi.spyOn(HomeserverService, 'putBlob').mockResolvedValue(undefined),
      listSpy: vi
        .mocked(HomeserverService.listAll)
        .mockImplementation(async ({ baseDirectory }) =>
          baseDirectory.includes('/pub/social/v1/posts/') ? [HEAD.url] : [],
        ),
      getBytesSpy: vi.mocked(HomeserverService.getBytes).mockResolvedValue(HEAD.body),
      fileCreateSpy: vi.spyOn(FileApplication, 'commitCreate').mockResolvedValue(undefined),
      fileDeleteSpy: vi.spyOn(FileApplication, 'commitDelete').mockResolvedValue(undefined),
      fileDeleteUploadedSpy: vi.spyOn(FileApplication, 'commitDeleteUploaded').mockResolvedValue(undefined),
      removeKindStreamsSpy: vi.spyOn(LocalPostService, 'removeFromKindStreams').mockResolvedValue(undefined),
    });

    it('reads the newest stored version and writes the next one above it', async () => {
      const mockData = createMockEditInput();
      const { listSpy, getBytesSpy, requestSpy } = setupEditSpies();

      await PostApplication.commitEdit(mockData);

      expect(listSpy).toHaveBeenCalledWith({ baseDirectory: `pubky://${AUTHOR}/pub/social/v1/posts/${HEAD.id}/` });
      expect(getBytesSpy).toHaveBeenCalledWith(HEAD.url);
      const [{ url, blob }] = requestSpy.mock.calls[0];
      expect(url > HEAD.url).toBe(true);
      expect(JSON.parse(new TextDecoder().decode(blob))).toMatchObject({ content: 'Edited content', kind: 'note' });
    });

    it('refuses to edit a post that has no v1 version (a 0.x post of an account not migrated)', async () => {
      setupEditSpies();
      vi.mocked(HomeserverService.listAll).mockResolvedValue([]);

      await expect(PostApplication.commitEdit(createMockEditInput())).rejects.toThrow('Post has no v1 version to edit');
      expect(HomeserverService.putBlob).not.toHaveBeenCalled();
    });

    it('should edit locally and sync to homeserver', async () => {
      const mockData = createMockEditInput();
      const { readDetailsSpy, editSpy, requestSpy } = setupEditSpies();

      await PostApplication.commitEdit(mockData);

      expect(readDetailsSpy).toHaveBeenCalledWith({ postId: mockData.compositePostId });
      expect(editSpy).toHaveBeenCalledWith({
        compositePostId: mockData.compositePostId,
        content: 'Edited content',
        attachments: null,
        kind: 'short',
      });
      expect(requestSpy).toHaveBeenCalledWith(nextVersionPut);
    });

    it('should rollback local edit when homeserver sync fails', async () => {
      const mockData = createMockEditInput();
      const { readDetailsSpy, editSpy, requestSpy, fileDeleteSpy, fileDeleteUploadedSpy } = setupEditSpies();
      requestSpy.mockRejectedValue(new Error('Failed to PUT to homeserver: 401'));

      await expect(PostApplication.commitEdit(mockData)).rejects.toThrow('Failed to PUT to homeserver: 401');

      expect(readDetailsSpy).toHaveBeenCalledWith({ postId: mockData.compositePostId });
      expect(editSpy).toHaveBeenCalledTimes(2);
      expect(editSpy).toHaveBeenNthCalledWith(1, {
        compositePostId: mockData.compositePostId,
        content: 'Edited content',
        attachments: null,
        kind: 'short',
      });
      expect(editSpy).toHaveBeenNthCalledWith(2, {
        compositePostId: mockData.compositePostId,
        content: 'Original content',
        attachments: null,
        kind: 'short',
      });
      // No new file uploads on this edit, so nothing to roll back on the file side
      expect(fileDeleteSpy).not.toHaveBeenCalled();
      expect(fileDeleteUploadedSpy).not.toHaveBeenCalled();
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

    // --- Attachment edits ---
    describe('with attachment changes', () => {
      const newUpload = createMockFileAttachment('new1');
      const newFileUri = newUpload.media.url;
      const oldFileUri = 'pubky://author/pub/pubky.app/files/old1';

      const originalPostDetails: PostDetailsModelSchema = {
        id: EDIT_ID,
        content: 'Original content',
        kind: 'image',
        uri: 'pubky://author/pub/pubky.app/posts/post123',
        indexed_at: Date.now(),
        attachments: [oldFileUri],
      };

      const createEditInputWithFiles = (): TEditPostInput => ({
        compositePostId: EDIT_ID,
        edit: {
          content: 'Edited content',
          attachmentUris: [newFileUri],
          attachmentNames: { [newFileUri]: newUpload.name },
          kind: 'image',
        },
        fileAttachments: [newUpload],
      });

      it('should upload new files before the local edit, and edit locally before the homeserver PUT', async () => {
        const mockData = createEditInputWithFiles();
        const { editSpy, requestSpy, fileCreateSpy } = setupEditSpies();

        await PostApplication.commitEdit(mockData);

        expect(fileCreateSpy).toHaveBeenCalledWith({ fileAttachments: mockData.fileAttachments });
        expect(editSpy).toHaveBeenCalledWith({
          compositePostId: mockData.compositePostId,
          content: 'Edited content',
          attachments: [newFileUri],
          kind: 'image',
        });
        expect(fileCreateSpy).toHaveBeenCalledBefore(editSpy);
        expect(editSpy).toHaveBeenCalledBefore(requestSpy);
      });

      it('should rollback local edit with original content/attachments/kind and delete new files when PUT fails', async () => {
        const mockData = createEditInputWithFiles();
        const { readDetailsSpy, editSpy, requestSpy, fileDeleteSpy, fileDeleteUploadedSpy } = setupEditSpies();
        readDetailsSpy.mockResolvedValue(originalPostDetails);
        requestSpy.mockRejectedValue(new Error('Failed to PUT to homeserver: 500'));

        await expect(PostApplication.commitEdit(mockData)).rejects.toThrow('Failed to PUT to homeserver: 500');

        expect(editSpy).toHaveBeenCalledTimes(2);
        expect(editSpy).toHaveBeenNthCalledWith(2, {
          compositePostId: mockData.compositePostId,
          content: 'Original content',
          attachments: [oldFileUri],
          kind: 'image',
        });
        // Rollback deletes by the known record + blob URLs, not by record URI
        expect(fileDeleteUploadedSpy).toHaveBeenCalledWith(mockData.fileAttachments);
        expect(fileDeleteSpy).not.toHaveBeenCalled();
      });

      it('should sweep new files and skip the local edit when file upload fails', async () => {
        const mockData = createEditInputWithFiles();
        const { editSpy, requestSpy, fileCreateSpy, fileDeleteSpy, fileDeleteUploadedSpy } = setupEditSpies();
        fileCreateSpy.mockRejectedValue(new Error('File upload failed: quota exceeded'));

        await expect(PostApplication.commitEdit(mockData)).rejects.toThrow('File upload failed: quota exceeded');

        expect(fileDeleteUploadedSpy).toHaveBeenCalledWith(mockData.fileAttachments);
        expect(fileDeleteSpy).not.toHaveBeenCalled();
        expect(editSpy).not.toHaveBeenCalled();
        expect(requestSpy).not.toHaveBeenCalled();
      });

      it('should propagate the upload error even when the sweep also fails', async () => {
        const mockData = createEditInputWithFiles();
        const { editSpy, fileCreateSpy, fileDeleteUploadedSpy } = setupEditSpies();
        fileCreateSpy.mockRejectedValue(new Error('File upload failed: quota exceeded'));
        fileDeleteUploadedSpy.mockRejectedValue(new Error('Sweep failed'));

        await expect(PostApplication.commitEdit(mockData)).rejects.toThrow('File upload failed: quota exceeded');

        expect(fileDeleteUploadedSpy).toHaveBeenCalledWith(mockData.fileAttachments);
        expect(editSpy).not.toHaveBeenCalled();
      });

      it('should delete uploaded files and skip the PUT when the local edit fails after uploads', async () => {
        const mockData = createEditInputWithFiles();
        const { editSpy, requestSpy, fileCreateSpy, fileDeleteSpy, fileDeleteUploadedSpy } = setupEditSpies();
        editSpy.mockRejectedValue(new Error('Local edit write failed'));

        await expect(PostApplication.commitEdit(mockData)).rejects.toThrow('Local edit write failed');

        expect(fileCreateSpy).toHaveBeenCalledWith({ fileAttachments: mockData.fileAttachments });
        // Uploads succeeded but the local write failed: sweep them or they orphan
        expect(fileDeleteUploadedSpy).toHaveBeenCalledWith(mockData.fileAttachments);
        expect(fileDeleteSpy).not.toHaveBeenCalled();
        // The PUT must never happen when the optimistic local write failed
        expect(requestSpy).not.toHaveBeenCalled();
      });

      it('should rethrow the local edit failure without file cleanup when there are no new uploads', async () => {
        const mockData = createMockEditInput();
        const { editSpy, requestSpy, fileDeleteSpy, fileDeleteUploadedSpy } = setupEditSpies();
        editSpy.mockRejectedValue(new Error('Local edit write failed'));

        await expect(PostApplication.commitEdit(mockData)).rejects.toThrow('Local edit write failed');

        expect(fileDeleteUploadedSpy).not.toHaveBeenCalled();
        expect(fileDeleteSpy).not.toHaveBeenCalled();
        expect(requestSpy).not.toHaveBeenCalled();
      });

      it('should delete only removed homeserver file URIs after a successful PUT', async () => {
        const mockData: TEditPostInput = {
          ...createMockEditInput(),
          removedUris: [oldFileUri, 'https://example.com/external.png'],
        };
        const { requestSpy, fileDeleteSpy } = setupEditSpies();

        await PostApplication.commitEdit(mockData);

        expect(fileDeleteSpy).toHaveBeenCalledWith([oldFileUri], EDIT_ID);
        expect(requestSpy).toHaveBeenCalledBefore(fileDeleteSpy);
      });

      it('should skip removed-attachment cleanup when no removed URI is a homeserver file', async () => {
        const mockData: TEditPostInput = {
          ...createMockEditInput(),
          removedUris: ['https://example.com/external.png'],
        };
        const { fileDeleteSpy } = setupEditSpies();

        await PostApplication.commitEdit(mockData);

        expect(fileDeleteSpy).not.toHaveBeenCalled();
      });

      it('should not fail the edit when removed-attachment cleanup fails', async () => {
        const mockData: TEditPostInput = {
          ...createMockEditInput(),
          removedUris: [oldFileUri],
        };
        const { editSpy, fileDeleteSpy } = setupEditSpies();
        fileDeleteSpy.mockRejectedValue(new Error('cleanup failed'));

        await expect(PostApplication.commitEdit(mockData)).resolves.toBeUndefined();

        expect(fileDeleteSpy).toHaveBeenCalledWith([oldFileUri], EDIT_ID);
        // The local edit sticks; no rollback happens for a cleanup failure
        expect(editSpy).toHaveBeenCalledTimes(1);
      });

      it('should remove the post from the old kind streams after a kind-changing edit succeeds', async () => {
        // mockPostDetails.kind is 'short'; the edited envelope is Image
        const mockData = createEditInputWithFiles();
        const { requestSpy, removeKindStreamsSpy } = setupEditSpies();

        await PostApplication.commitEdit(mockData);

        expect(removeKindStreamsSpy).toHaveBeenCalledWith({
          compositePostId: mockData.compositePostId,
          kind: 'short',
        });
        expect(requestSpy).toHaveBeenCalledBefore(removeKindStreamsSpy);
      });

      it('should not touch kind streams when the kind is unchanged', async () => {
        const mockData = createMockEditInput(); // Short envelope, 'short' stored kind
        const { removeKindStreamsSpy } = setupEditSpies();

        await PostApplication.commitEdit(mockData);

        expect(removeKindStreamsSpy).not.toHaveBeenCalled();
      });

      it('should not touch kind streams when the PUT fails', async () => {
        const mockData = createEditInputWithFiles();
        const { requestSpy, removeKindStreamsSpy } = setupEditSpies();
        requestSpy.mockRejectedValue(new Error('Failed to PUT to homeserver: 500'));

        await expect(PostApplication.commitEdit(mockData)).rejects.toThrow('Failed to PUT to homeserver: 500');

        expect(removeKindStreamsSpy).not.toHaveBeenCalled();
      });

      it('should not fail the edit when old-kind stream cleanup fails', async () => {
        const mockData = createEditInputWithFiles();
        const { editSpy, removeKindStreamsSpy } = setupEditSpies();
        removeKindStreamsSpy.mockRejectedValue(new Error('stream cleanup failed'));

        await expect(PostApplication.commitEdit(mockData)).resolves.toBeUndefined();

        // The local edit sticks; no rollback happens for a cleanup failure
        expect(editSpy).toHaveBeenCalledTimes(1);
      });
    });
  });
});
