import {
  buildFile,
  buildPost,
  decodeContent,
  decodeObject,
  editPost,
  listPrefix,
  parseUri,
  toPath,
} from 'pubky-social-specs';
import { fakeOwner } from 'pubky-social-specs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FileApplication } from '@/application/file/file';
import { PostApplication } from '@/application/post/post';
import type { TCreatePostInput } from '@/application/post/post.types';
import { PostStreamApplication } from '@/application/stream/posts/post';
import { TagApplication } from '@/application/tag/tag';
import { TagKind, type TCreateTagInput } from '@/application/tag/tag.types';
import { NEXUS_STREAM_MAX_LIMIT } from '@/config/nexus';
import type { TFetchPostTaggersParams } from '@/controllers/post/post.types';
import { ClientErrorCode, DatabaseErrorCode, ServerErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { Logger } from '@/libs/logger/logger';
import type { Pubky } from '@/models/models.types';
import type { PostCountsModelSchema } from '@/models/post/counts/postCounts.schema';
import { PostDetailsModel } from '@/models/post/details/postDetails';
import type { PostDetailsModelSchema } from '@/models/post/details/postDetails.schema';
import type { PostRelationshipsModelSchema } from '@/models/post/relationships/postRelationships.schema';
import type { TFileAttachmentResult } from '@/pipes/file/file.types';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { installHomeserverWriteRetryDependenciesForTests } from '@/services/homeserver/write-retry';
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
    readReplies: vi.fn(),
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

// Mock the HomeserverService: the write path is `putBlob` / `deleteIdempotent`, the read path
// `listAll` + `getBytes`, and the edit's fence is inert here (the retry loop is the real one).
vi.mock('@/services/homeserver/homeserver', () => ({
  HomeserverService: {
    putBlob: vi.fn(),
    listAll: vi.fn(),
    getBytes: vi.fn(),
    exists: vi.fn(),
    deleteIdempotent: vi.fn(),
    createWriteFence: vi.fn(() => ({ enter: vi.fn(), assertCurrent: vi.fn() })),
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

const OWNER = fakeOwner(1);

/** A 429 as `HomeserverService` reports one: the retry policy reads the status off the context. */
const rateLimited = () =>
  Err.server(ServerErrorCode.UNKNOWN_ERROR, 'Too many requests', {
    service: ErrorService.Homeserver,
    operation: 'putBlob',
    context: { statusCode: 429 },
  });

describe('Post Application', () => {
  // Test data factories
  const createMockPostData = (content = 'Hello, world!'): TCreatePostInput => {
    const post = buildPost(OWNER, { content });
    return { compositePostId: `${OWNER}:${post.id}`, post };
  };

  const createMockFileAttachment = (byte: number): TFileAttachmentResult => {
    const bytes = new Uint8Array([byte]);
    return {
      media: buildFile(OWNER, { bytes, type: 'image/png' }),
      bytes,
      name: `file-${byte}.png`,
      contentType: 'image/png',
    };
  };

  const createMockTag = (id: string, label: string = 'test-tag'): TCreateTagInput => ({
    taggerId: OWNER as Pubky,
    taggedId: id,
    label,
    taggedKind: TagKind.POST,
    tagUrl: `pubky://${OWNER}/pub/social/v1/tags/${label}.json`,
    tagJson: { uri: `pubky://${OWNER}/pub/social/v1/posts/${id}`, label },
  });

  // Spy setup helpers
  const setupCreateSpies = () => ({
    commitCreateSpy: vi.spyOn(FileApplication, 'commitCreate').mockResolvedValue(undefined),
    saveSpy: vi.spyOn(LocalPostService, 'create').mockResolvedValue(undefined),
    deleteSpy: vi.spyOn(LocalPostService, 'delete').mockResolvedValue(false),
    putBlobSpy: vi.spyOn(HomeserverService, 'putBlob').mockResolvedValue(undefined),
    tagCreateSpy: vi.spyOn(TagApplication, 'commitCreate').mockResolvedValue(undefined),
  });

  beforeEach(() => {
    vi.clearAllMocks();
    installHomeserverWriteRetryDependenciesForTests({ sleep: async () => {}, random: () => 0 });
  });

  afterEach(() => {
    installHomeserverWriteRetryDependenciesForTests(null);
  });

  describe('commitCreate', () => {
    it('saves the post locally, then PUTs the first version where buildPost named it', async () => {
      const mockData = createMockPostData();
      const { saveSpy, putBlobSpy } = setupCreateSpies();

      await PostApplication.commitCreate(mockData);

      expect(saveSpy).toHaveBeenCalledWith({ compositePostId: mockData.compositePostId, post: mockData.post });
      expect(putBlobSpy).toHaveBeenCalledWith({ url: mockData.post.url, blob: mockData.post.body });
      expect(saveSpy.mock.invocationCallOrder[0]).toBeLessThan(putBlobSpy.mock.invocationCallOrder[0]);
    });

    it('should propagate error when local save fails', async () => {
      const mockData = createMockPostData();
      const { saveSpy, putBlobSpy } = setupCreateSpies();
      saveSpy.mockRejectedValue(new Error('Database write failed'));

      await expect(PostApplication.commitCreate(mockData)).rejects.toThrow('Database write failed');
      expect(putBlobSpy).not.toHaveBeenCalled();
    });

    it('should rollback local write and propagate error when homeserver sync fails', async () => {
      const mockData = createMockPostData();
      const { deleteSpy, putBlobSpy } = setupCreateSpies();
      putBlobSpy.mockRejectedValue(new Error('Homeserver sync failed'));

      await expect(PostApplication.commitCreate(mockData)).rejects.toThrow('Homeserver sync failed');
      expect(deleteSpy).toHaveBeenCalledWith({ compositePostId: mockData.compositePostId });
    });

    it('should propagate original error when rollback also fails', async () => {
      const mockData = createMockPostData();
      const { deleteSpy, putBlobSpy } = setupCreateSpies();
      putBlobSpy.mockRejectedValue(new Error('Homeserver sync failed'));
      deleteSpy.mockRejectedValue(new Error('Rollback failed'));
      const loggerSpy = vi.spyOn(Logger, 'error').mockImplementation(() => {});

      await expect(PostApplication.commitCreate(mockData)).rejects.toThrow('Homeserver sync failed');
      expect(loggerSpy).toHaveBeenCalledWith(
        '[PostApplication.commitCreate] Failed to rollback local post create',
        expect.objectContaining({ compositePostId: mockData.compositePostId }),
      );
    });

    describe('with file attachments', () => {
      it('should upload files before saving post locally', async () => {
        const mockData = { ...createMockPostData(), fileAttachments: [createMockFileAttachment(1)] };
        const { commitCreateSpy, saveSpy, putBlobSpy } = setupCreateSpies();

        await PostApplication.commitCreate(mockData);

        expect(commitCreateSpy).toHaveBeenCalledWith({ fileAttachments: mockData.fileAttachments });
        expect(commitCreateSpy.mock.invocationCallOrder[0]).toBeLessThan(saveSpy.mock.invocationCallOrder[0]);
        expect(saveSpy.mock.invocationCallOrder[0]).toBeLessThan(putBlobSpy.mock.invocationCallOrder[0]);
      });

      it('should sweep the whole batch and skip the post when an upload fails', async () => {
        const fileAttachments = [createMockFileAttachment(1), createMockFileAttachment(2)];
        const mockData = { ...createMockPostData(), fileAttachments };
        const { commitCreateSpy, saveSpy, putBlobSpy } = setupCreateSpies();
        commitCreateSpy.mockRejectedValue(new Error('File upload failed'));
        const sweepSpy = vi.spyOn(FileApplication, 'commitDeleteUploaded').mockResolvedValue(undefined);

        await expect(PostApplication.commitCreate(mockData)).rejects.toThrow('File upload failed');
        expect(sweepSpy).toHaveBeenCalledWith(fileAttachments);
        expect(saveSpy).not.toHaveBeenCalled();
        expect(putBlobSpy).not.toHaveBeenCalled();
      });

      it('should roll back the uploads when the local post write fails', async () => {
        const fileAttachments = [createMockFileAttachment(1)];
        const mockData = { ...createMockPostData(), fileAttachments };
        const { saveSpy, putBlobSpy } = setupCreateSpies();
        saveSpy.mockRejectedValue(new Error('Database write failed'));
        const sweepSpy = vi.spyOn(FileApplication, 'commitDeleteUploaded').mockResolvedValue(undefined);

        await expect(PostApplication.commitCreate(mockData)).rejects.toThrow('Database write failed');
        expect(sweepSpy).toHaveBeenCalledWith(fileAttachments);
        expect(putBlobSpy).not.toHaveBeenCalled();
      });

      it('should propagate the upload error when the batch rollback also fails', async () => {
        const mockData = { ...createMockPostData(), fileAttachments: [createMockFileAttachment(1)] };
        const { commitCreateSpy } = setupCreateSpies();
        commitCreateSpy.mockRejectedValue(new Error('File upload failed'));
        vi.spyOn(FileApplication, 'commitDeleteUploaded').mockRejectedValue(new Error('Rollback failed'));
        const loggerSpy = vi.spyOn(Logger, 'error').mockImplementation(() => {});

        await expect(PostApplication.commitCreate(mockData)).rejects.toThrow('File upload failed');
        expect(loggerSpy).toHaveBeenCalledWith(
          '[PostApplication.commitCreate] Failed to rollback file attachments',
          expect.objectContaining({ compositePostId: mockData.compositePostId }),
        );
      });
    });

    describe('with tags', () => {
      it('should create tags after homeserver sync', async () => {
        const isCurrent = () => true;
        const mockData = { ...createMockPostData(), tags: [createMockTag('post123')], isCurrent };
        const { putBlobSpy, tagCreateSpy } = setupCreateSpies();

        await PostApplication.commitCreate(mockData);

        expect(tagCreateSpy).toHaveBeenCalledWith({ tagList: mockData.tags, isCurrent });
        expect(putBlobSpy.mock.invocationCallOrder[0]).toBeLessThan(tagCreateSpy.mock.invocationCallOrder[0]);
      });

      it('should propagate tag creation error after post sync', async () => {
        const mockData = { ...createMockPostData(), tags: [createMockTag('post123')] };
        const { putBlobSpy, tagCreateSpy } = setupCreateSpies();
        tagCreateSpy.mockRejectedValue(new Error('Tag creation failed'));

        await expect(PostApplication.commitCreate(mockData)).rejects.toThrow('Tag creation failed');
        expect(putBlobSpy).toHaveBeenCalledTimes(1);
      });

      it('should skip tag creation with an empty list', async () => {
        const mockData = { ...createMockPostData(), tags: [], fileAttachments: [] };
        const { commitCreateSpy, tagCreateSpy } = setupCreateSpies();

        await PostApplication.commitCreate(mockData);

        expect(commitCreateSpy).not.toHaveBeenCalled();
        expect(tagCreateSpy).not.toHaveBeenCalled();
      });
    });

    it('should rollback local write, rollback files, and skip tags when homeserver sync fails', async () => {
      const fileAttachments = [createMockFileAttachment(1)];
      const mockData = { ...createMockPostData(), fileAttachments, tags: [createMockTag('post123')] };
      const { deleteSpy, putBlobSpy, tagCreateSpy } = setupCreateSpies();
      putBlobSpy.mockRejectedValue(new Error('Homeserver sync failed'));
      const sweepSpy = vi.spyOn(FileApplication, 'commitDeleteUploaded').mockResolvedValue(undefined);

      await expect(PostApplication.commitCreate(mockData)).rejects.toThrow('Homeserver sync failed');
      expect(deleteSpy).toHaveBeenCalledWith({ compositePostId: mockData.compositePostId });
      expect(sweepSpy).toHaveBeenCalledWith(fileAttachments);
      expect(tagCreateSpy).not.toHaveBeenCalled();
    });
  });

  describe('commitDelete', () => {
    const post = buildPost(OWNER, { content: 'Test post' });
    const second = editPost(OWNER, post.url, { ...post.object, content: 'edited' });
    const compositePostId = `${OWNER}:${post.id}`;
    const legacyUrl = `${listPrefix(OWNER, 'legacy')}posts/${post.id}`;
    const publicDirectory = `pubky://${OWNER}/pub/social/v1/posts/${post.id}/`;
    const privateDirectory = `${listPrefix(OWNER, 'private')}posts/${post.id}/`;

    const row = (overrides: Partial<PostDetailsModelSchema> = {}): PostDetailsModelSchema => ({
      id: compositePostId,
      content: 'Test post',
      kind: 'short',
      uri: `pubky://${OWNER}/pub/social/v1/posts/${post.id}`,
      indexed_at: Date.now(),
      attachments: null,
      ...overrides,
    });

    const setupDeleteSpies = ({
      listings = { public: [second.url, post.url], private: [] },
      legacyExists = false,
      hadConnections = false,
    }: {
      listings?: { public: string[]; private: string[] };
      legacyExists?: boolean;
      hadConnections?: boolean;
    } = {}) => ({
      findByIdSpy: vi.spyOn(PostDetailsModel, 'findById'),
      deleteSpy: vi.spyOn(LocalPostService, 'delete').mockResolvedValue(hadConnections),
      listAllSpy: vi
        .spyOn(HomeserverService, 'listAll')
        .mockImplementation(async ({ baseDirectory }) =>
          baseDirectory === publicDirectory
            ? listings.public
            : baseDirectory === privateDirectory
              ? listings.private
              : [],
        ),
      existsSpy: vi.spyOn(HomeserverService, 'exists').mockResolvedValue(legacyExists),
      deleteIdempotentSpy: vi.spyOn(HomeserverService, 'deleteIdempotent').mockResolvedValue(undefined),
      fileCommitDeleteSpy: vi.spyOn(FileApplication, 'commitDelete').mockResolvedValue(undefined),
    });

    it('tombstones the row, then deletes every version oldest first, and the 0.x copy before them', async () => {
      const { findByIdSpy, deleteSpy, listAllSpy, existsSpy, deleteIdempotentSpy } = setupDeleteSpies({
        legacyExists: true,
      });
      findByIdSpy.mockResolvedValue(asOpaque<PostDetailsModel>(row()));

      await PostApplication.commitDelete({ compositePostId, canWriteLegacy: true });

      expect(deleteSpy).toHaveBeenCalledWith({ compositePostId });
      expect(listAllSpy).toHaveBeenCalledWith({ baseDirectory: publicDirectory });
      expect(listAllSpy).toHaveBeenCalledWith({ baseDirectory: privateDirectory });
      expect(existsSpy).toHaveBeenCalledWith(legacyUrl);
      // The order `deletionPaths` gives: the 0.x copy, then the versions oldest first
      expect(deleteIdempotentSpy.mock.calls.map(([url]) => url)).toEqual([legacyUrl, post.url, second.url]);
      // Sequential: a reader never sees a post whose newest version is gone before its older ones
      const [legacy, oldest, newest] = deleteIdempotentSpy.mock.invocationCallOrder;
      expect(deleteSpy.mock.invocationCallOrder[0]).toBeLessThan(legacy);
      expect(legacy).toBeLessThan(oldest);
      expect(oldest).toBeLessThan(newest);
    });

    it('leaves the 0.x copy and warns when the grant cannot write the 0.x tree (legacyRefused)', async () => {
      const { findByIdSpy, deleteIdempotentSpy } = setupDeleteSpies({ legacyExists: true });
      findByIdSpy.mockResolvedValue(asOpaque<PostDetailsModel>(row()));
      const warnSpy = vi.spyOn(Logger, 'warn').mockImplementation(() => {});

      await PostApplication.commitDelete({ compositePostId, canWriteLegacy: false });

      expect(deleteIdempotentSpy.mock.calls.map(([url]) => url)).toEqual([post.url, second.url]);
      expect(warnSpy).toHaveBeenCalledWith(
        '[PostApplication.commitDelete] The 0.x copy stays: the grant cannot write the 0.x tree',
        { compositePostId },
      );
    });

    it('deletes nothing on the homeserver when no copy is listed, and never the 0.x path when absent', async () => {
      const { findByIdSpy, deleteIdempotentSpy } = setupDeleteSpies({ listings: { public: [], private: [] } });
      findByIdSpy.mockResolvedValue(asOpaque<PostDetailsModel>(row()));

      await PostApplication.commitDelete({ compositePostId, canWriteLegacy: true });

      expect(deleteIdempotentSpy).not.toHaveBeenCalled();
    });

    it('deletes a private version after the public ones', async () => {
      const privateVersion = buildPost(OWNER, { content: 'draft', root: 'private' });
      const privateUrl = `pubky://${OWNER}/priv/social/v1/posts/${post.id}/${privateVersion.editId}.json`;
      const { findByIdSpy, deleteIdempotentSpy } = setupDeleteSpies({
        listings: { public: [post.url], private: [privateUrl.replace(privateVersion.editId, post.id)] },
      });
      findByIdSpy.mockResolvedValue(asOpaque<PostDetailsModel>(row()));

      await PostApplication.commitDelete({ compositePostId, canWriteLegacy: true });

      expect(deleteIdempotentSpy.mock.calls.map(([url]) => toPath(url))).toEqual([
        toPath(post.url),
        toPath(privateUrl.replace(privateVersion.editId, post.id)),
      ]);
    });

    it('should throw NOT_FOUND when the post is not cached', async () => {
      const { findByIdSpy, deleteSpy, deleteIdempotentSpy } = setupDeleteSpies();
      findByIdSpy.mockResolvedValue(null);

      await expect(PostApplication.commitDelete({ compositePostId, canWriteLegacy: true })).rejects.toMatchObject({
        code: ClientErrorCode.NOT_FOUND,
      });
      expect(deleteSpy).not.toHaveBeenCalled();
      expect(deleteIdempotentSpy).not.toHaveBeenCalled();
    });

    it('should propagate error when local delete fails, before any homeserver call', async () => {
      const { findByIdSpy, deleteSpy, listAllSpy, deleteIdempotentSpy } = setupDeleteSpies();
      findByIdSpy.mockResolvedValue(asOpaque<PostDetailsModel>(row()));
      deleteSpy.mockRejectedValue(new Error('Local delete failed'));

      await expect(PostApplication.commitDelete({ compositePostId, canWriteLegacy: true })).rejects.toThrow(
        'Local delete failed',
      );
      expect(listAllSpy).not.toHaveBeenCalled();
      expect(deleteIdempotentSpy).not.toHaveBeenCalled();
    });

    it('should propagate error when a homeserver delete fails, stopping at that copy', async () => {
      const { findByIdSpy, deleteIdempotentSpy, fileCommitDeleteSpy } = setupDeleteSpies();
      findByIdSpy.mockResolvedValue(asOpaque<PostDetailsModel>(row({ attachments: ['pubky://x'] })));
      deleteIdempotentSpy.mockRejectedValueOnce(new Error('Homeserver delete failed'));

      await expect(PostApplication.commitDelete({ compositePostId, canWriteLegacy: true })).rejects.toThrow(
        'Homeserver delete failed',
      );
      expect(deleteIdempotentSpy).toHaveBeenCalledTimes(1);
      expect(fileCommitDeleteSpy).not.toHaveBeenCalled();
    });

    it('should propagate database error when findById throws', async () => {
      const { findByIdSpy } = setupDeleteSpies();
      findByIdSpy.mockRejectedValue(
        Err.database(DatabaseErrorCode.QUERY_FAILED, 'Database query failed', {
          service: ErrorService.Local,
          operation: 'findById',
        }),
      );

      await expect(PostApplication.commitDelete({ compositePostId, canWriteLegacy: true })).rejects.toMatchObject({
        code: DatabaseErrorCode.QUERY_FAILED,
      });
    });

    describe('media clean-up', () => {
      const attachments = [createMockFileAttachment(1).media.url, createMockFileAttachment(2).media.url];

      it('deletes the attachments nothing else references after the homeserver deletes', async () => {
        const { findByIdSpy, deleteIdempotentSpy, fileCommitDeleteSpy } = setupDeleteSpies();
        findByIdSpy.mockResolvedValue(asOpaque<PostDetailsModel>(row({ attachments })));

        await PostApplication.commitDelete({ compositePostId, canWriteLegacy: true });

        expect(fileCommitDeleteSpy).toHaveBeenCalledWith(attachments, compositePostId);
        expect(deleteIdempotentSpy.mock.invocationCallOrder.at(-1)).toBeLessThan(
          fileCommitDeleteSpy.mock.invocationCallOrder[0],
        );
      });

      it('skips attachment cleanup when the post keeps its row (hadConnections)', async () => {
        const { findByIdSpy, deleteIdempotentSpy, fileCommitDeleteSpy } = setupDeleteSpies({ hadConnections: true });
        findByIdSpy.mockResolvedValue(asOpaque<PostDetailsModel>(row({ attachments })));

        await PostApplication.commitDelete({ compositePostId, canWriteLegacy: true });

        expect(deleteIdempotentSpy).toHaveBeenCalledTimes(2);
        expect(fileCommitDeleteSpy).not.toHaveBeenCalled();
      });

      it('should not fail the delete when file cleanup fails (best-effort)', async () => {
        const { findByIdSpy, fileCommitDeleteSpy } = setupDeleteSpies();
        findByIdSpy.mockResolvedValue(asOpaque<PostDetailsModel>(row({ attachments })));
        fileCommitDeleteSpy.mockRejectedValue(new Error('cleanup failed'));
        const warnSpy = vi.spyOn(Logger, 'warn').mockImplementation(() => {});

        await expect(PostApplication.commitDelete({ compositePostId, canWriteLegacy: true })).resolves.toBeUndefined();
        expect(warnSpy).toHaveBeenCalledWith(
          '[PostApplication.commitDelete] Failed to cleanup post attachments',
          expect.objectContaining({ compositePostId }),
        );
      });

      it('deletes a collection cover and an article cover, even when the post keeps its row', async () => {
        const cover = createMockFileAttachment(9).media.url;
        const { findByIdSpy, fileCommitDeleteSpy } = setupDeleteSpies({ hadConnections: true });
        findByIdSpy.mockResolvedValueOnce(
          asOpaque<PostDetailsModel>(
            row({ kind: 'collection', content: JSON.stringify({ name: 'c', cover_image: cover }) }),
          ),
        );
        findByIdSpy.mockResolvedValueOnce(
          asOpaque<PostDetailsModel>(
            row({ kind: 'long', content: JSON.stringify({ title: 't', body: 'b', cover_image: cover }) }),
          ),
        );

        await PostApplication.commitDelete({ compositePostId, canWriteLegacy: true });
        await PostApplication.commitDelete({ compositePostId, canWriteLegacy: true });

        expect(fileCommitDeleteSpy).toHaveBeenCalledTimes(2);
        expect(fileCommitDeleteSpy).toHaveBeenNthCalledWith(1, [cover], compositePostId);
        expect(fileCommitDeleteSpy).toHaveBeenNthCalledWith(2, [cover], compositePostId);
      });

      it('does not delete an external https cover, nor look for one on a note', async () => {
        const { findByIdSpy, fileCommitDeleteSpy } = setupDeleteSpies();
        findByIdSpy.mockResolvedValueOnce(
          asOpaque<PostDetailsModel>(
            row({
              kind: 'collection',
              content: JSON.stringify({ name: 'c', cover_image: 'https://example.com/c.png' }),
            }),
          ),
        );
        findByIdSpy.mockResolvedValueOnce(
          asOpaque<PostDetailsModel>(row({ content: JSON.stringify({ cover_image: 'x' }) })),
        );

        await PostApplication.commitDelete({ compositePostId, canWriteLegacy: true });
        await PostApplication.commitDelete({ compositePostId, canWriteLegacy: true });

        expect(fileCommitDeleteSpy).not.toHaveBeenCalled();
      });

      it('does not fail the delete when cover cleanup fails', async () => {
        const cover = createMockFileAttachment(9).media.url;
        const { findByIdSpy, fileCommitDeleteSpy } = setupDeleteSpies();
        findByIdSpy.mockResolvedValue(
          asOpaque<PostDetailsModel>(
            row({ kind: 'collection', content: JSON.stringify({ name: 'c', cover_image: cover }) }),
          ),
        );
        fileCommitDeleteSpy.mockRejectedValue(new Error('cover cleanup failed'));
        const warnSpy = vi.spyOn(Logger, 'warn').mockImplementation(() => {});

        await expect(PostApplication.commitDelete({ compositePostId, canWriteLegacy: true })).resolves.toBeUndefined();
        expect(warnSpy).toHaveBeenCalledWith(
          '[PostApplication.commitDelete] Failed to cleanup cover',
          expect.objectContaining({ compositePostId, coverUri: cover }),
        );
      });
    });
  });

  describe('commitEdit', () => {
    const head = buildPost(OWNER, {
      content: 'Original content',
      lock: `pubky://${OWNER}/pub/app.locks/0035QZPT4QG00.json`,
    });
    const compositePostId = `${OWNER}:${head.id}`;
    const directory = `pubky://${OWNER}/pub/social/v1/posts/${head.id}/`;

    const originalRow: PostDetailsModelSchema = {
      id: compositePostId,
      content: 'Original content',
      kind: 'short',
      uri: `pubky://${OWNER}/pub/social/v1/posts/${head.id}`,
      indexed_at: Date.now(),
      attachments: null,
      lock: head.object.lock,
    };

    /** A homeserver holding `versions` of the post: LIST answers their URLs, GET their bytes. */
    const storeVersions = (...versions: (typeof head)[]) => {
      const byUrl = new Map<string, Uint8Array>(versions.map((version) => [version.url, version.body]));
      vi.spyOn(HomeserverService, 'listAll').mockResolvedValue([...byUrl.keys()]);
      vi.spyOn(HomeserverService, 'getBytes').mockImplementation(async (url: string) => {
        const bytes = byUrl.get(url);
        if (!bytes) throw new Error(`not stored: ${url}`);
        return bytes;
      });
      return byUrl;
    };

    const setupEditSpies = () => ({
      readDetailsSpy: vi.spyOn(LocalPostService, 'readDetails').mockResolvedValue(originalRow),
      editSpy: vi.spyOn(LocalPostService, 'edit').mockResolvedValue(undefined),
      putBlobSpy: vi.spyOn(HomeserverService, 'putBlob').mockResolvedValue(undefined),
      fileCreateSpy: vi.spyOn(FileApplication, 'commitCreate').mockResolvedValue(undefined),
      fileDeleteSpy: vi.spyOn(FileApplication, 'commitDelete').mockResolvedValue(undefined),
      fileDeleteUploadedSpy: vi.spyOn(FileApplication, 'commitDeleteUploaded').mockResolvedValue(undefined),
      removeKindStreamsSpy: vi.spyOn(LocalPostService, 'removeFromKindStreams').mockResolvedValue(undefined),
    });

    /** The version the last PUT wrote. */
    const lastPut = (putBlobSpy: ReturnType<typeof setupEditSpies>['putBlobSpy']) => {
      const [{ url, blob }] = putBlobSpy.mock.calls.at(-1)!;
      return { url, post: decodeObject(url, blob, 'post') };
    };

    it('projects the edit onto the row first, then writes the next version above the head and converges', async () => {
      storeVersions(head);
      const { editSpy, putBlobSpy } = setupEditSpies();
      const listAllSpy = vi.mocked(HomeserverService.listAll);

      await PostApplication.commitEdit({ compositePostId, edit: { content: 'Edited content' } });

      // Local-first: the Dexie projection lands before the head is read
      expect(editSpy).toHaveBeenNthCalledWith(1, { compositePostId, content: 'Edited content' });
      expect(editSpy.mock.invocationCallOrder[0]).toBeLessThan(listAllSpy.mock.invocationCallOrder[0]);
      expect(listAllSpy).toHaveBeenCalledWith({ baseDirectory: directory });

      // The next version: above the head, same post, content changed, the lock carried over
      const written = lastPut(putBlobSpy);
      const at = parseUri(written.url);
      expect(at.kind === 'post' && at.id === head.id && at.editId! > head.editId).toBe(true);
      expect(written.post).toEqual({ ...head.object, content: 'Edited content' });
      expect(putBlobSpy).toHaveBeenCalledWith(expect.objectContaining({ url: written.url, fence: expect.anything() }));

      // Convergence: the row now holds what was PUT, kinds in the local vocabulary
      expect(editSpy).toHaveBeenNthCalledWith(2, {
        compositePostId,
        content: 'Edited content',
        attachments: null,
        kind: 'short',
      });
    });

    it('edits the newest version when the post was edited before, not its first one', async () => {
      const second = editPost(OWNER, head.url, { ...head.object, content: 'second' });
      storeVersions(head, second);
      const { putBlobSpy } = setupEditSpies();

      await PostApplication.commitEdit({ compositePostId, edit: { content: 'third' } });

      const at = parseUri(lastPut(putBlobSpy).url);
      expect(at.kind === 'post' && at.editId! > second.editId).toBe(true);
    });

    it("keeps an article's cover and an attachment's alt text, which the row never held", async () => {
      const cover = createMockFileAttachment(9).media.url;
      const inline = createMockFileAttachment(1).media.url;
      const article = buildPost(OWNER, {
        kind: 'article',
        title: 'T',
        body: '![a](attachment:0)',
        cover_image: cover,
        attachments: [{ uri: inline, alt: 'A picture' }],
      });
      storeVersions(article);
      const { readDetailsSpy, putBlobSpy } = setupEditSpies();
      readDetailsSpy.mockResolvedValue({ ...originalRow, id: `${OWNER}:${article.id}`, kind: 'long', content: '{}' });

      await PostApplication.commitEdit({
        compositePostId: `${OWNER}:${article.id}`,
        edit: { content: JSON.stringify({ title: 'T2', body: '![a](attachment:0)' }), attachmentUris: [inline] },
      });

      const { post } = lastPut(putBlobSpy);
      expect(decodeContent(post)).toEqual({
        kind: 'article',
        content: { title: 'T2', body: '![a](attachment:0)', cover_image: cover },
      });
      expect(post.attachments).toEqual([{ uri: inline, alt: 'A picture', name: null }]);
    });

    it('re-reads the head after a 429 and lands above a version another session wrote meanwhile', async () => {
      const byUrl = storeVersions(head);
      const { putBlobSpy } = setupEditSpies();
      const listAllSpy = vi.mocked(HomeserverService.listAll);
      // Between the two passes another session edits the post
      const theirs = editPost(OWNER, head.url, { ...head.object, content: 'theirs' });
      putBlobSpy.mockImplementationOnce(async () => {
        byUrl.set(theirs.url, theirs.body);
        listAllSpy.mockResolvedValue([...byUrl.keys()]);
        throw rateLimited();
      });

      await PostApplication.commitEdit({ compositePostId, edit: { content: 'mine' } });

      expect(listAllSpy).toHaveBeenCalledTimes(2);
      expect(putBlobSpy).toHaveBeenCalledTimes(2);
      const [first, second] = putBlobSpy.mock.calls.map(([{ url }]) => parseUri(url));
      expect(first.kind === 'post' && first.editId! > head.editId).toBe(true);
      // The second pass built on their version: above it, with their head as the base
      expect(second.kind === 'post' && second.editId! > theirs.editId).toBe(true);
      expect(lastPut(putBlobSpy).post.content).toBe('mine');
    });

    it('fails with NOT_FOUND and restores the row when the post has no v1 version', async () => {
      storeVersions();
      const { editSpy, putBlobSpy } = setupEditSpies();

      await expect(PostApplication.commitEdit({ compositePostId, edit: { content: 'Edited' } })).rejects.toMatchObject({
        code: ClientErrorCode.NOT_FOUND,
        message: 'Post has no v1 version to edit',
      });
      expect(putBlobSpy).not.toHaveBeenCalled();
      expect(editSpy).toHaveBeenLastCalledWith({
        compositePostId,
        content: originalRow.content,
        attachments: originalRow.attachments,
        kind: originalRow.kind,
      });
    });

    it('should rollback local edit when homeserver sync fails', async () => {
      storeVersions(head);
      const { editSpy, putBlobSpy, removeKindStreamsSpy } = setupEditSpies();
      putBlobSpy.mockRejectedValue(new Error('Homeserver sync failed'));

      await expect(
        PostApplication.commitEdit({ compositePostId, edit: { content: 'Edited', kind: 'image' } }),
      ).rejects.toThrow('Homeserver sync failed');
      expect(editSpy).toHaveBeenLastCalledWith({
        compositePostId,
        content: originalRow.content,
        attachments: originalRow.attachments,
        kind: originalRow.kind,
      });
      expect(removeKindStreamsSpy).not.toHaveBeenCalled();
    });

    it('should propagate original error when edit rollback also fails', async () => {
      storeVersions(head);
      const { editSpy, putBlobSpy } = setupEditSpies();
      putBlobSpy.mockRejectedValue(new Error('Homeserver sync failed'));
      editSpy.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('Rollback failed'));
      const loggerSpy = vi.spyOn(Logger, 'error').mockImplementation(() => {});

      await expect(PostApplication.commitEdit({ compositePostId, edit: { content: 'Edited' } })).rejects.toThrow(
        'Homeserver sync failed',
      );
      expect(loggerSpy).toHaveBeenCalledWith(
        '[PostApplication.commitEdit] Failed to rollback local post edit',
        expect.objectContaining({ compositePostId }),
      );
    });

    it('rejects a missing or tombstoned row as not-found before any upload or read', async () => {
      const { readDetailsSpy, fileCreateSpy } = setupEditSpies();
      const listAllSpy = vi.mocked(HomeserverService.listAll);
      readDetailsSpy.mockResolvedValueOnce(null).mockResolvedValueOnce({ ...originalRow, content: '', deleted: true });

      for (let attempt = 0; attempt < 2; attempt += 1) {
        await expect(
          PostApplication.commitEdit({
            compositePostId,
            edit: { content: 'Edited' },
            fileAttachments: [createMockFileAttachment(1)],
          }),
        ).rejects.toMatchObject({ code: ClientErrorCode.NOT_FOUND });
      }
      expect(fileCreateSpy).not.toHaveBeenCalled();
      expect(listAllSpy).not.toHaveBeenCalled();
    });

    describe('with attachment changes', () => {
      const kept = createMockFileAttachment(1).media.url;
      const added = createMockFileAttachment(2);
      const removed = createMockFileAttachment(3).media.url;
      const withAttachments = () =>
        buildPost(OWNER, { kind: 'image', content: 'pics', attachments: [{ uri: kept }, { uri: removed }] });

      it('should upload new files before the local edit, and edit locally before the homeserver PUT', async () => {
        storeVersions(withAttachments());
        const { editSpy, putBlobSpy, fileCreateSpy } = setupEditSpies();

        await PostApplication.commitEdit({
          compositePostId,
          edit: {
            content: 'pics',
            attachmentUris: [kept, added.media.url],
            attachmentNames: { [added.media.url]: 'added' },
          },
          fileAttachments: [added],
        });

        expect(fileCreateSpy).toHaveBeenCalledWith({ fileAttachments: [added] });
        expect(fileCreateSpy.mock.invocationCallOrder[0]).toBeLessThan(editSpy.mock.invocationCallOrder[0]);
        expect(editSpy.mock.invocationCallOrder[0]).toBeLessThan(putBlobSpy.mock.invocationCallOrder[0]);
        expect(editSpy).toHaveBeenNthCalledWith(1, {
          compositePostId,
          content: 'pics',
          attachments: [kept, added.media.url],
        });
        expect(lastPut(putBlobSpy).post.attachments).toEqual([
          { uri: kept, alt: null, name: null },
          { uri: added.media.url, alt: null, name: 'added' },
        ]);
      });

      it('should rollback the local edit and delete the new files when the PUT fails', async () => {
        storeVersions(withAttachments());
        const { editSpy, putBlobSpy, fileDeleteUploadedSpy } = setupEditSpies();
        putBlobSpy.mockRejectedValue(new Error('PUT failed'));

        await expect(
          PostApplication.commitEdit({
            compositePostId,
            edit: { attachmentUris: [kept, added.media.url] },
            fileAttachments: [added],
          }),
        ).rejects.toThrow('PUT failed');

        expect(editSpy).toHaveBeenLastCalledWith({
          compositePostId,
          content: originalRow.content,
          attachments: originalRow.attachments,
          kind: originalRow.kind,
        });
        expect(fileDeleteUploadedSpy).toHaveBeenCalledWith([added]);
      });

      it('should sweep new files and skip the local edit when file upload fails', async () => {
        const { editSpy, fileCreateSpy, fileDeleteUploadedSpy } = setupEditSpies();
        fileCreateSpy.mockRejectedValue(new Error('upload failed'));

        await expect(
          PostApplication.commitEdit({
            compositePostId,
            edit: { attachmentUris: [added.media.url] },
            fileAttachments: [added],
          }),
        ).rejects.toThrow('upload failed');

        expect(fileDeleteUploadedSpy).toHaveBeenCalledWith([added]);
        expect(editSpy).not.toHaveBeenCalled();
      });

      it('should delete uploaded files and skip the PUT when the local edit fails after uploads', async () => {
        storeVersions(withAttachments());
        const { editSpy, putBlobSpy, fileDeleteUploadedSpy } = setupEditSpies();
        editSpy.mockRejectedValueOnce(new Error('local edit failed'));

        await expect(
          PostApplication.commitEdit({
            compositePostId,
            edit: { attachmentUris: [added.media.url] },
            fileAttachments: [added],
          }),
        ).rejects.toThrow('local edit failed');

        expect(fileDeleteUploadedSpy).toHaveBeenCalledWith([added]);
        expect(putBlobSpy).not.toHaveBeenCalled();
      });

      it('should delete only removed homeserver file URIs after a successful PUT, as the post giving them up', async () => {
        storeVersions(withAttachments());
        const { fileDeleteSpy, putBlobSpy } = setupEditSpies();

        await PostApplication.commitEdit({
          compositePostId,
          edit: { attachmentUris: [kept] },
          removedUris: [removed, 'https://example.com/external.png'],
        });

        expect(fileDeleteSpy).toHaveBeenCalledWith([removed], compositePostId);
        expect(putBlobSpy.mock.invocationCallOrder[0]).toBeLessThan(fileDeleteSpy.mock.invocationCallOrder[0]);
      });

      it('never deletes a removed URI the version just written still references', async () => {
        storeVersions(withAttachments());
        const { fileDeleteSpy } = setupEditSpies();

        // A file removed and added again names the same URI: it stays referenced
        await PostApplication.commitEdit({
          compositePostId,
          edit: { attachmentUris: [kept, removed] },
          removedUris: [removed],
        });

        expect(fileDeleteSpy).not.toHaveBeenCalled();
      });

      it('should not fail the edit when removed-attachment cleanup fails', async () => {
        storeVersions(withAttachments());
        const { fileDeleteSpy } = setupEditSpies();
        fileDeleteSpy.mockRejectedValue(new Error('cleanup failed'));
        const warnSpy = vi.spyOn(Logger, 'warn').mockImplementation(() => {});

        await expect(
          PostApplication.commitEdit({ compositePostId, edit: { attachmentUris: [kept] }, removedUris: [removed] }),
        ).resolves.toBeUndefined();
        expect(warnSpy).toHaveBeenCalledWith(
          '[PostApplication.commitEdit] Failed to cleanup removed attachments',
          expect.objectContaining({ compositePostId }),
        );
      });

      it('should remove the post from the old kind streams after a kind-changing edit succeeds', async () => {
        storeVersions(head);
        const { removeKindStreamsSpy, putBlobSpy } = setupEditSpies();

        await PostApplication.commitEdit({
          compositePostId,
          edit: { attachmentUris: [added.media.url], kind: 'image' },
          fileAttachments: [added],
        });

        expect(removeKindStreamsSpy).toHaveBeenCalledWith({ compositePostId, kind: 'short' });
        expect(putBlobSpy.mock.invocationCallOrder[0]).toBeLessThan(removeKindStreamsSpy.mock.invocationCallOrder[0]);
      });

      it('should not touch kind streams when the kind is unchanged', async () => {
        storeVersions(head);
        const { removeKindStreamsSpy } = setupEditSpies();

        await PostApplication.commitEdit({ compositePostId, edit: { content: 'still a note' } });

        expect(removeKindStreamsSpy).not.toHaveBeenCalled();
      });

      it('should not fail the edit when old-kind stream cleanup fails', async () => {
        storeVersions(head);
        const { removeKindStreamsSpy } = setupEditSpies();
        removeKindStreamsSpy.mockRejectedValue(new Error('stream cleanup failed'));
        const warnSpy = vi.spyOn(Logger, 'warn').mockImplementation(() => {});

        await expect(
          PostApplication.commitEdit({ compositePostId, edit: { attachmentUris: [added.media.url], kind: 'image' } }),
        ).resolves.toBeUndefined();
        expect(warnSpy).toHaveBeenCalledWith(
          '[PostApplication.commitEdit] Failed to remove post from old kind streams',
          expect.objectContaining({ compositePostId, oldKind: 'short' }),
        );
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
});
