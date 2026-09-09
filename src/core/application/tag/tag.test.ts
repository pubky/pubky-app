import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TagKind } from '@/application/tag/tag.types';
import { MARKER_TTL_MS } from '@/config/viewerTagMarker';
import { ClientErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { HttpMethod } from '@/libs/http/http.types';
import type { Pubky } from '@/models/models.types';
import { PostTagsModel } from '@/models/post/tags/postTags';
import { UserTagsModel } from '@/models/user/tags/userTags';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { LocalPostTagService } from '@/services/local/tag/post/tag.post';
import { LocalUserTagService } from '@/services/local/tag/user/tag.user';
import { ViewerTagMarkerStorage } from '@/services/local/tag/viewerTagMarkerStorage';
import { TagApplication } from './tag';
import type { TCreateTagInput, TDeleteTagInput } from './tag.types';

// Mock the HomeserverService
vi.mock('@/services/homeserver/homeserver', () => ({
  HomeserverService: {
    request: vi.fn(),
  },
}));

// Build a real AppError for the relevant client status so the layered
// `error instanceof AppError && error.code === ...` checks pass.
const httpError = (code: ClientErrorCode, operation: string) =>
  Err.client(code, code, {
    service: ErrorService.Homeserver,
    operation,
  });

describe('Tag Application', () => {
  // Test data factory
  const createMockTagData = (taggedKind: TagKind = TagKind.POST): TCreateTagInput => ({
    taggedId: taggedKind === TagKind.POST ? 'author:post123' : ('tagged-user-123' as Pubky),
    label: 'test-tag',
    taggerId: 'tagger123' as Pubky,
    tagUrl: 'pubky://tagger123/pub/pubky.app/tags/test-tag',
    tagJson: { label: 'test-tag' },
    taggedKind,
  });

  const createMockTagBatch = (labels: string[], taggedKind: TagKind = TagKind.POST): TCreateTagInput[] =>
    labels.map((label, index) => ({
      taggedId: taggedKind === TagKind.POST ? 'author:post123' : ('tagged-user-123' as Pubky),
      label,
      taggerId: `tagger${index + 1}` as Pubky,
      tagUrl: `pubky://tagger${index + 1}/pub/pubky.app/tags/${label}`,
      tagJson: { label },
      taggedKind,
    }));

  const createMockDeleteData = (taggedKind: TagKind = TagKind.POST): TDeleteTagInput => ({
    taggedId: taggedKind === TagKind.POST ? 'author:post123' : ('tagged-user-123' as Pubky),
    label: 'test-tag',
    taggerId: 'tagger123' as Pubky,
    tagUrl: 'pubky://tagger123/pub/pubky.app/tags/test-tag',
    taggedKind,
  });

  // Helper functions
  const setupMocks = (taggedKind: TagKind = TagKind.POST) => {
    const localTagService = taggedKind === TagKind.POST ? LocalPostTagService : LocalUserTagService;

    return {
      createSpy: vi.spyOn(localTagService, 'create'),
      deleteSpy: vi.spyOn(localTagService, 'delete'),
      requestSpy: vi.spyOn(HomeserverService, 'request'),
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  describe.each([TagKind.POST, TagKind.USER])('mutation compensation for %s', (kind) => {
    describe.each(['expired', 'cleared', 'unreadable', 'unavailable from the start', 'same timestamp'])(
      'with mutation markers %s',
      (storageState) => {
        it.each([HttpMethod.PUT, HttpMethod.DELETE] as const)(
          'preserves a newer toggle when an older %s fails',
          async (op) => {
            vi.restoreAllMocks();
            const data = createMockTagData(kind);
            const service = kind === TagKind.POST ? LocalPostTagService : LocalUserTagService;
            const now = vi.spyOn(Date, 'now').mockReturnValue(1000);
            if (storageState === 'unavailable from the start') {
              vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
                throw new DOMException('Storage unavailable', 'QuotaExceededError');
              });
            }
            if (op === HttpMethod.DELETE) await service.create(data);

            let rejectFirst!: (error: unknown) => void;
            const firstRequest = new Promise<void>((_resolve, reject) => {
              rejectFirst = reject;
            });
            const request = vi
              .mocked(HomeserverService.request)
              .mockReturnValueOnce(firstRequest)
              .mockResolvedValue(undefined);
            const commit = (method: HttpMethod.PUT | HttpMethod.DELETE) =>
              method === HttpMethod.PUT
                ? TagApplication.commitCreate({ tagList: [data] })
                : TagApplication.commitDelete(data);
            const failure = httpError(ClientErrorCode.BAD_REQUEST, 'delayed-tag-write');
            const firstResult = commit(op).catch((error: unknown) => error);
            try {
              await vi.waitFor(() => expect(request).toHaveBeenCalledOnce());
              if (storageState !== 'same timestamp') now.mockReturnValue(1001);
              await commit(op === HttpMethod.PUT ? HttpMethod.DELETE : HttpMethod.PUT);
              await commit(op);

              if (storageState === 'expired') now.mockReturnValue(1001 + MARKER_TTL_MS);
              if (storageState === 'cleared') sessionStorage.clear();
              if (storageState === 'unreadable') {
                vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
                  throw new DOMException('Storage unavailable', 'SecurityError');
                });
              }
              if (storageState !== 'same timestamp') expect(TagApplication.getViewerMutation(data)).toBeNull();

              rejectFirst(failure);
              expect(await firstResult).toBe(failure);
              const saved =
                kind === TagKind.POST
                  ? await PostTagsModel.findById(data.taggedId)
                  : await UserTagsModel.findById(data.taggedId);
              const tag = saved?.tags.find((tag) => tag.label === data.label);
              expect(tag?.taggers.includes(data.taggerId) ?? false).toBe(op === HttpMethod.PUT);
              expect(tag?.taggers_count ?? 0).toBe(op === HttpMethod.PUT ? 1 : 0);
              expect(request).toHaveBeenCalledTimes(3);
            } finally {
              rejectFirst(failure);
              await firstResult;
              vi.restoreAllMocks();
            }
          },
        );
      },
    );

    describe.each(['expired', 'unavailable'])('with markers %s and no newer toggle', (storageState) => {
      it.each([HttpMethod.PUT, HttpMethod.DELETE] as const)('still rolls back a failed %s', async (op) => {
        vi.restoreAllMocks();
        const data = createMockTagData(kind);
        const service = kind === TagKind.POST ? LocalPostTagService : LocalUserTagService;
        const now = vi.spyOn(Date, 'now').mockReturnValue(1000);
        if (storageState === 'unavailable') {
          vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new DOMException('Storage unavailable', 'QuotaExceededError');
          });
        }
        try {
          if (op === HttpMethod.DELETE) await service.create(data);
          const failure = httpError(ClientErrorCode.BAD_REQUEST, 'tag-write');
          vi.mocked(HomeserverService.request).mockImplementation(async () => {
            now.mockReturnValue(1000 + MARKER_TTL_MS);
            expect(TagApplication.getViewerMutation(data)).toBeNull();
            throw failure;
          });

          await expect(
            op === HttpMethod.PUT
              ? TagApplication.commitCreate({ tagList: [data] })
              : TagApplication.commitDelete(data),
          ).rejects.toBe(failure);
          const saved =
            kind === TagKind.POST
              ? await PostTagsModel.findById(data.taggedId)
              : await UserTagsModel.findById(data.taggedId);
          const tag = saved?.tags.find((tag) => tag.label === data.label);
          expect(tag?.taggers.includes(data.taggerId) ?? false).toBe(op === HttpMethod.DELETE);
          expect(tag?.taggers_count ?? 0).toBe(op === HttpMethod.DELETE ? 1 : 0);
        } finally {
          vi.restoreAllMocks();
        }
      });
    });

    it.each([HttpMethod.PUT, HttpMethod.DELETE] as const)(
      'still rolls back a failed %s when unrelated tags change',
      async (op) => {
        vi.restoreAllMocks();
        const data = createMockTagData(kind);
        const service = kind === TagKind.POST ? LocalPostTagService : LocalUserTagService;
        if (op === HttpMethod.DELETE) await service.create(data);
        const failure = httpError(ClientErrorCode.BAD_REQUEST, 'tag-write');
        vi.mocked(HomeserverService.request).mockImplementation(async () => {
          // Each event differs in exactly one part of the mutation identity.
          ViewerTagMarkerStorage.set({
            pubky: 'other-viewer' as Pubky,
            taggedId: data.taggedId,
            label: data.label,
            op,
          });
          await service.create({ ...data, taggedId: `${data.taggedId}-other` });
          await service.create({ ...data, label: 'other-tag' });
          throw failure;
        });

        await expect(
          op === HttpMethod.PUT ? TagApplication.commitCreate({ tagList: [data] }) : TagApplication.commitDelete(data),
        ).rejects.toBe(failure);
        const saved =
          kind === TagKind.POST
            ? await PostTagsModel.findById(data.taggedId)
            : await UserTagsModel.findById(data.taggedId);
        const tag = saved?.tags.find((tag) => tag.label === data.label);
        expect(tag?.taggers.includes(data.taggerId) ?? false).toBe(op === HttpMethod.DELETE);
        expect(tag?.taggers_count ?? 0).toBe(op === HttpMethod.DELETE ? 1 : 0);
        expect(saved?.tags.find((tag) => tag.label === 'other-tag')?.taggers).toContain(data.taggerId);
      },
    );

    it.each([
      { op: HttpMethod.PUT, status: 'success' },
      { op: HttpMethod.PUT, status: 'failure' },
      { op: HttpMethod.DELETE, status: 'success' },
      { op: HttpMethod.DELETE, status: 'failure' },
      { op: HttpMethod.DELETE, status: 'not found' },
    ] as const)('stops watching mutations after $op $status', async ({ op, status }) => {
      vi.restoreAllMocks();
      const data = createMockTagData(kind);
      const service = kind === TagKind.POST ? LocalPostTagService : LocalUserTagService;
      if (op === HttpMethod.DELETE) await service.create(data);
      const subscribe = ViewerTagMarkerStorage.subscribe.bind(ViewerTagMarkerStorage);
      const unsubscribe = vi.fn<() => void>();
      vi.spyOn(ViewerTagMarkerStorage, 'subscribe').mockImplementation((listener) => {
        unsubscribe.mockImplementation(subscribe(listener));
        return unsubscribe;
      });
      const failure = httpError(
        status === 'not found' ? ClientErrorCode.NOT_FOUND : ClientErrorCode.BAD_REQUEST,
        'tag-write',
      );
      vi.mocked(HomeserverService.request).mockImplementation(async () => {
        expect(unsubscribe).not.toHaveBeenCalled();
        if (status !== 'success') throw failure;
      });
      try {
        const result =
          op === HttpMethod.PUT ? TagApplication.commitCreate({ tagList: [data] }) : TagApplication.commitDelete(data);
        if (status === 'failure') await expect(result).rejects.toBe(failure);
        else await expect(result).resolves.toBeUndefined();
        expect(unsubscribe).toHaveBeenCalledOnce();
      } finally {
        unsubscribe();
        vi.restoreAllMocks();
      }
    });

    it.each([HttpMethod.PUT, HttpMethod.DELETE] as const)(
      'still syncs %s to the homeserver when a mutation subscriber throws',
      async (op) => {
        const data = createMockTagData(kind);
        // Use the real local service and database, including its marker write.
        vi.restoreAllMocks();
        const service = kind === TagKind.POST ? LocalPostTagService : LocalUserTagService;
        if (op === HttpMethod.DELETE) await service.create(data);
        vi.mocked(HomeserverService.request).mockResolvedValue(undefined);
        const unsubscribe = ViewerTagMarkerStorage.subscribe(() => {
          throw new Error('subscriber failed');
        });
        const listener = vi.fn();
        const unsubscribeListener = ViewerTagMarkerStorage.subscribe(listener);
        try {
          await expect(
            op === HttpMethod.PUT
              ? TagApplication.commitCreate({ tagList: [data] })
              : TagApplication.commitDelete(data),
          ).resolves.toBeUndefined();
          expect(HomeserverService.request).toHaveBeenCalledWith(
            expect.objectContaining({ method: op, url: data.tagUrl }),
          );
          const saved =
            kind === TagKind.POST
              ? await PostTagsModel.findById(data.taggedId)
              : await UserTagsModel.findById(data.taggedId);
          expect(
            saved?.tags.some((tag) => tag.label === data.label && tag.taggers.includes(data.taggerId)) ?? false,
          ).toBe(op === HttpMethod.PUT);
          expect(TagApplication.getViewerMutation(data)?.op).toBe(op);
          expect(listener).toHaveBeenCalledExactlyOnceWith({
            taggerId: data.taggerId,
            taggedId: data.taggedId,
            label: data.label,
            taggersCount: op === HttpMethod.PUT ? 1 : 0,
          });
        } finally {
          unsubscribe();
          unsubscribeListener();
        }
      },
    );

    it.each([HttpMethod.PUT, HttpMethod.DELETE] as const)(
      'restores a failed %s marker even if background data made rollback a no-op',
      async (op) => {
        const data = createMockTagData(kind);
        const { createSpy, deleteSpy, requestSpy } = setupMocks(kind);
        const write = op === HttpMethod.PUT ? createSpy : deleteSpy;
        const undo = op === HttpMethod.PUT ? deleteSpy : createSpy;
        write.mockImplementation(async () => {
          ViewerTagMarkerStorage.set({ pubky: data.taggerId, taggedId: data.taggedId, label: data.label, op });
          return true;
        });
        undo.mockResolvedValue(false);
        requestSpy.mockRejectedValue(httpError(ClientErrorCode.BAD_REQUEST, 'tag-test'));

        await expect(
          op === HttpMethod.PUT ? TagApplication.commitCreate({ tagList: [data] }) : TagApplication.commitDelete(data),
        ).rejects.toThrow();

        expect(TagApplication.getViewerMutation(data)?.op).toBe(
          op === HttpMethod.PUT ? HttpMethod.DELETE : HttpMethod.PUT,
        );
      },
    );

    it.each([HttpMethod.PUT, HttpMethod.DELETE] as const)(
      'does not undo a newer viewer intent when an older %s fails',
      async (op) => {
        const data = createMockTagData(kind);
        const { createSpy, deleteSpy, requestSpy } = setupMocks(kind);
        const markerParams = { pubky: data.taggerId, taggedId: data.taggedId, label: data.label };
        const write = op === HttpMethod.PUT ? createSpy : deleteSpy;
        const undo = op === HttpMethod.PUT ? deleteSpy : createSpy;
        write.mockImplementation(async () => {
          ViewerTagMarkerStorage.set({ ...markerParams, op });
          return true;
        });
        undo.mockResolvedValue(false);
        const now = vi.spyOn(Date, 'now').mockReturnValue(1000);
        requestSpy.mockImplementation(async () => {
          now.mockReturnValue(1001);
          ViewerTagMarkerStorage.set({ ...markerParams, op });
          throw httpError(ClientErrorCode.BAD_REQUEST, 'tag-test');
        });
        try {
          await expect(
            op === HttpMethod.PUT
              ? TagApplication.commitCreate({ tagList: [data] })
              : TagApplication.commitDelete(data),
          ).rejects.toThrow();
          expect(TagApplication.getViewerMutation(data)?.op).toBe(op);
          expect(TagApplication.getViewerMutation(data)?.ts).toBe(1001);
          expect(undo).not.toHaveBeenCalled();
        } finally {
          now.mockRestore();
        }
      },
    );
  });

  describe('commitCreate', () => {
    it('should save locally and sync to homeserver successfully', async () => {
      const mockData = createMockTagData();
      const { createSpy, requestSpy } = setupMocks();

      createSpy.mockResolvedValue(true);
      requestSpy.mockResolvedValue(undefined);

      await TagApplication.commitCreate({ tagList: [mockData] });

      expect(createSpy).toHaveBeenCalledWith({
        taggedId: mockData.taggedId,
        label: mockData.label,
        taggerId: mockData.taggerId,
      });
      expect(requestSpy).toHaveBeenCalledWith({
        method: HttpMethod.PUT,
        url: mockData.tagUrl,
        bodyJson: mockData.tagJson,
      });
    });

    it('should throw when local save fails', async () => {
      const mockData = createMockTagData();
      const { createSpy, requestSpy } = setupMocks();

      createSpy.mockRejectedValue(new Error('Database error'));

      await expect(TagApplication.commitCreate({ tagList: [mockData] })).rejects.toThrow('Database error');
      expect(createSpy).toHaveBeenCalledOnce();
      expect(requestSpy).not.toHaveBeenCalled();
    });

    it('should rollback local create when homeserver sync fails', async () => {
      const mockData = createMockTagData();
      const { createSpy, deleteSpy, requestSpy } = setupMocks();

      createSpy.mockResolvedValue(true);
      deleteSpy.mockResolvedValue(true);
      requestSpy.mockRejectedValue(new Error('Failed to PUT to homeserver: 500'));

      await expect(TagApplication.commitCreate({ tagList: [mockData] })).rejects.toThrow(
        'Failed to PUT to homeserver: 500',
      );
      expect(createSpy).toHaveBeenCalledOnce();
      expect(requestSpy).toHaveBeenCalledOnce();
      expect(deleteSpy).toHaveBeenCalledWith({
        taggedId: mockData.taggedId,
        label: mockData.label,
        taggerId: mockData.taggerId,
      });
    });

    it('should rollback local create for user tags when homeserver sync fails', async () => {
      const mockData = createMockTagData(TagKind.USER);
      const { createSpy, deleteSpy, requestSpy } = setupMocks(TagKind.USER);

      createSpy.mockResolvedValue(true);
      deleteSpy.mockResolvedValue(true);
      requestSpy.mockRejectedValue(new Error('Failed to PUT to homeserver: 500'));

      await expect(TagApplication.commitCreate({ tagList: [mockData] })).rejects.toThrow(
        'Failed to PUT to homeserver: 500',
      );
      expect(createSpy).toHaveBeenCalledWith({
        taggedId: mockData.taggedId,
        label: mockData.label,
        taggerId: mockData.taggerId,
      });
      expect(requestSpy).toHaveBeenCalledOnce();
      expect(deleteSpy).toHaveBeenCalledWith({
        taggedId: mockData.taggedId,
        label: mockData.label,
        taggerId: mockData.taggerId,
      });
    });

    it('should stop processing later tags after an earlier create failure', async () => {
      const mockData = createMockTagBatch(['first-tag', 'second-tag']);
      const { createSpy, deleteSpy, requestSpy } = setupMocks();

      createSpy.mockResolvedValue(true);
      deleteSpy.mockResolvedValue(true);
      requestSpy.mockRejectedValueOnce(new Error('Failed to PUT to homeserver: 500'));

      await expect(TagApplication.commitCreate({ tagList: mockData })).rejects.toThrow(
        'Failed to PUT to homeserver: 500',
      );

      expect(createSpy).toHaveBeenCalledTimes(1);
      expect(createSpy).toHaveBeenCalledWith({
        taggedId: mockData[0].taggedId,
        label: mockData[0].label,
        taggerId: mockData[0].taggerId,
      });
      expect(requestSpy).toHaveBeenCalledTimes(1);
      expect(requestSpy).toHaveBeenCalledWith({
        method: HttpMethod.PUT,
        url: mockData[0].tagUrl,
        bodyJson: mockData[0].tagJson,
      });
      expect(deleteSpy).toHaveBeenCalledTimes(1);
      expect(deleteSpy).toHaveBeenCalledWith({
        taggedId: mockData[0].taggedId,
        label: mockData[0].label,
        taggerId: mockData[0].taggerId,
      });
    });
  });

  describe('commitDelete', () => {
    it('should remove locally and sync to homeserver successfully', async () => {
      const mockData = createMockDeleteData();
      const { deleteSpy, requestSpy } = setupMocks();

      deleteSpy.mockResolvedValue(true);
      requestSpy.mockResolvedValue(undefined);

      await TagApplication.commitDelete(mockData);

      expect(deleteSpy).toHaveBeenCalledWith({
        taggedId: mockData.taggedId,
        label: mockData.label,
        taggerId: mockData.taggerId,
      });
      expect(requestSpy).toHaveBeenCalledWith({ method: HttpMethod.DELETE, url: mockData.tagUrl });
    });

    it('should throw when local remove fails', async () => {
      const mockData = createMockDeleteData();
      const { deleteSpy, requestSpy } = setupMocks();

      deleteSpy.mockRejectedValue(new Error('User has not tagged this post with this label'));

      await expect(TagApplication.commitDelete(mockData)).rejects.toThrow(
        'User has not tagged this post with this label',
      );
      expect(deleteSpy).toHaveBeenCalledOnce();
      expect(requestSpy).not.toHaveBeenCalled();
    });

    it('should rollback local delete when homeserver sync fails', async () => {
      const mockData = createMockDeleteData();
      const { createSpy, deleteSpy, requestSpy } = setupMocks();

      deleteSpy.mockResolvedValue(true);
      createSpy.mockResolvedValue(true);
      requestSpy.mockRejectedValue(new Error('Failed to DELETE from homeserver: 404'));

      await expect(TagApplication.commitDelete(mockData)).rejects.toThrow('Failed to DELETE from homeserver: 404');
      expect(deleteSpy).toHaveBeenCalledOnce();
      expect(requestSpy).toHaveBeenCalledOnce();
      expect(createSpy).toHaveBeenCalledWith({
        taggedId: mockData.taggedId,
        label: mockData.label,
        taggerId: mockData.taggerId,
      });
    });

    it('should rollback local delete for user tags when homeserver sync fails', async () => {
      const mockData = createMockDeleteData(TagKind.USER);
      const { createSpy, deleteSpy, requestSpy } = setupMocks(TagKind.USER);

      deleteSpy.mockResolvedValue(true);
      createSpy.mockResolvedValue(true);
      requestSpy.mockRejectedValue(new Error('Failed to DELETE from homeserver: 404'));

      await expect(TagApplication.commitDelete(mockData)).rejects.toThrow('Failed to DELETE from homeserver: 404');
      expect(deleteSpy).toHaveBeenCalledWith({
        taggedId: mockData.taggedId,
        label: mockData.label,
        taggerId: mockData.taggerId,
      });
      expect(requestSpy).toHaveBeenCalledOnce();
      expect(createSpy).toHaveBeenCalledWith({
        taggedId: mockData.taggedId,
        label: mockData.label,
        taggerId: mockData.taggerId,
      });
    });

    it('should not call homeserver when nothing was deleted locally (idempotent)', async () => {
      const mockData = createMockDeleteData();
      const { deleteSpy, requestSpy } = setupMocks();

      deleteSpy.mockResolvedValue(false); // Nothing to delete

      await TagApplication.commitDelete(mockData);

      expect(deleteSpy).toHaveBeenCalledOnce();
      expect(requestSpy).not.toHaveBeenCalled();
    });

    it('should treat 404 (Not Found) as already-deleted and skip rollback', async () => {
      const mockData = createMockDeleteData();
      const { createSpy, deleteSpy, requestSpy } = setupMocks();

      deleteSpy.mockResolvedValue(true);
      // Tag URL is content-addressed; 404 means the exact tag is already gone on HS.
      requestSpy.mockRejectedValue(httpError(ClientErrorCode.NOT_FOUND, 'commitDelete'));

      // Should resolve, not throw — local delete is already correct.
      await TagApplication.commitDelete(mockData);

      expect(deleteSpy).toHaveBeenCalledOnce();
      expect(requestSpy).toHaveBeenCalledOnce();
      // Without this, rollback re-creates the tag and the user is stuck with a
      // ghost tag they can't remove (HS keeps returning 404 on every retry).
      expect(createSpy).not.toHaveBeenCalled();
    });
  });

  describe('clearViewerMarkers', () => {
    it('delegates to ViewerTagMarkerStorage.clearForUser', () => {
      const spy = vi.spyOn(ViewerTagMarkerStorage, 'clearForUser').mockImplementation(() => {});

      TagApplication.clearViewerMarkers('user-pubky' as Pubky);

      expect(spy).toHaveBeenCalledWith('user-pubky');
    });
  });
});
