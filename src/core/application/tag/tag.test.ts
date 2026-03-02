import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TagApplication } from './tag';
import * as Core from '@/core';
import { HttpMethod } from '@/libs';
import type { TCreateTagInput, TDeleteTagInput } from './tag.types';

// Mock the Local.Tag service
vi.mock('@/core/services/local/tag', () => ({
  LocalTagService: {
    create: vi.fn(),
    delete: vi.fn(),
  },
}));

// Mock the HomeserverService
vi.mock('@/core/services/homeserver', () => ({
  HomeserverService: {
    request: vi.fn(),
  },
}));

describe('Tag Application', () => {
  // Test data factory
  const createMockTagData = (): TCreateTagInput => ({
    taggedId: 'author:post123',
    label: 'test-tag',
    taggerId: 'tagger123' as Core.Pubky,
    tagUrl: 'pubky://tagger123/pub/pubky.app/tags/test-tag',
    tagJson: { label: 'test-tag' },
    taggedKind: Core.TagKind.POST,
  });

  const createMockDeleteData = (): TDeleteTagInput => ({
    taggedId: 'author:post123',
    label: 'test-tag',
    taggerId: 'tagger123' as Core.Pubky,
    tagUrl: 'pubky://tagger123/pub/pubky.app/tags/test-tag',
    taggedKind: Core.TagKind.POST,
  });

  // Helper functions
  const setupMocks = () => ({
    createSpy: vi.spyOn(Core.LocalPostTagService, 'create'),
    deleteSpy: vi.spyOn(Core.LocalPostTagService, 'delete'),
    requestSpy: vi.spyOn(Core.HomeserverService, 'request'),
  });

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
