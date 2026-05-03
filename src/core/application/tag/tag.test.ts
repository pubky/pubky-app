import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TagKind } from '@/application/tag/tag.types';
import { HttpMethod } from '@/libs/http/http.types';
import type { Pubky } from '@/models/models.types';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { LocalPostTagService } from '@/services/local/tag/post/tag.post';
import { LocalUserTagService } from '@/services/local/tag/user/tag.user';
import { TagApplication } from './tag';
import type { TCreateTagInput, TDeleteTagInput } from './tag.types';

// Mock the HomeserverService
vi.mock('@/services/homeserver/homeserver', () => ({
  HomeserverService: {
    request: vi.fn(),
  },
}));

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
  });
});
