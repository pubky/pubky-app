import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BookmarkApplication } from './bookmark';
import * as Core from '@/core';
import type { TCreateBookmarkInput, TDeleteBookmarkInput } from './bookmark.types';
import { mockAuthStore } from '@/test-utils';
import { HttpMethod } from '@/libs/http/http.types';

// Mock the LocalBookmarkService
vi.mock('@/core/services/local/bookmark', () => ({
  LocalBookmarkService: {
    persist: vi.fn(),
  },
}));

// Mock the HomeserverService
vi.mock('@/core/services/homeserver', () => ({
  HomeserverService: {
    request: vi.fn(),
  },
}));

describe('BookmarkApplication', () => {
  const testUserId = 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo' as Core.Pubky;

  // Test data factory
  const createMockBookmarkData = (): TCreateBookmarkInput => ({
    postId: 'author:post123',
    bookmarkUrl: 'pubky://user123/pub/pubky.app/bookmarks/abc',
    bookmarkJson: { uri: 'pubky://author/pub/pubky.app/posts/post123' },
  });

  const createMockDeleteData = (): TDeleteBookmarkInput => ({
    postId: 'author:post123',
    bookmarkUrl: 'pubky://user123/pub/pubky.app/bookmarks/abc',
  });

  // Helper functions
  const setupMocks = () => ({
    persistSpy: vi.spyOn(Core.LocalBookmarkService, 'persist'),
    requestSpy: vi.spyOn(Core.HomeserverService, 'request'),
    authSpy: vi.spyOn(Core.useAuthStore, 'getState'),
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('persist with PUT action', () => {
    it('should save locally and sync to homeserver successfully', async () => {
      const mockData = createMockBookmarkData();
      const { persistSpy, requestSpy, authSpy } = setupMocks();

      authSpy.mockReturnValue(mockAuthStore({ selectCurrentUserPubky: () => testUserId }));
      persistSpy.mockResolvedValue(undefined);
      requestSpy.mockResolvedValue(undefined);

      await BookmarkApplication.persist(HttpMethod.PUT, mockData);

      expect(persistSpy).toHaveBeenCalledWith(HttpMethod.PUT, {
        userId: testUserId,
        postId: mockData.postId,
      });
      expect(requestSpy).toHaveBeenCalledWith({
        method: HttpMethod.PUT,
        url: mockData.bookmarkUrl,
        bodyJson: mockData.bookmarkJson,
      });
    });

    it('should throw error when user is not authenticated', async () => {
      const mockData = createMockBookmarkData();
      const { authSpy } = setupMocks();

      // Mock unauthenticated state - selectCurrentUserPubky throws when user is null
      authSpy.mockReturnValue(
        mockAuthStore({
          selectCurrentUserPubky: () => {
            throw new Error('Current user pubky is not available. User may not be authenticated.');
          },
        }),
      );

      await expect(BookmarkApplication.persist(HttpMethod.PUT, mockData)).rejects.toThrow(
        'Current user pubky is not available',
      );
    });

    it('should throw when local save fails', async () => {
      const mockData = createMockBookmarkData();
      const { persistSpy, authSpy } = setupMocks();

      authSpy.mockReturnValue(mockAuthStore({ selectCurrentUserPubky: () => testUserId }));
      persistSpy.mockRejectedValue(new Error('Database error'));

      await expect(BookmarkApplication.persist(HttpMethod.PUT, mockData)).rejects.toThrow('Database error');
      expect(persistSpy).toHaveBeenCalledOnce();
    });

    it('should throw when homeserver sync fails', async () => {
      const mockData = createMockBookmarkData();
      const { persistSpy, requestSpy, authSpy } = setupMocks();

      authSpy.mockReturnValue(mockAuthStore({ selectCurrentUserPubky: () => testUserId }));
      persistSpy.mockResolvedValue(undefined);
      requestSpy.mockRejectedValue(new Error('Failed to PUT to homeserver: 500'));

      await expect(BookmarkApplication.persist(HttpMethod.PUT, mockData)).rejects.toThrow(
        'Failed to PUT to homeserver: 500',
      );
      expect(persistSpy).toHaveBeenCalledOnce();
      expect(requestSpy).toHaveBeenCalledOnce();
    });
  });

  describe('persist with DELETE action', () => {
    it('should remove locally and sync to homeserver successfully', async () => {
      const mockData = createMockDeleteData();
      const { persistSpy, requestSpy, authSpy } = setupMocks();

      authSpy.mockReturnValue(mockAuthStore({ selectCurrentUserPubky: () => testUserId }));
      persistSpy.mockResolvedValue(undefined);
      requestSpy.mockResolvedValue(undefined);

      await BookmarkApplication.persist(HttpMethod.DELETE, mockData);

      expect(persistSpy).toHaveBeenCalledWith(HttpMethod.DELETE, {
        userId: testUserId,
        postId: mockData.postId,
      });
      expect(requestSpy).toHaveBeenCalledWith({
        method: HttpMethod.DELETE,
        url: mockData.bookmarkUrl,
        bodyJson: undefined,
      });
    });

    it('should throw error when user is not authenticated', async () => {
      const mockData = createMockDeleteData();
      const { authSpy } = setupMocks();

      // Mock unauthenticated state - selectCurrentUserPubky throws when user is null
      authSpy.mockReturnValue(
        mockAuthStore({
          selectCurrentUserPubky: () => {
            throw new Error('Current user pubky is not available. User may not be authenticated.');
          },
        }),
      );

      await expect(BookmarkApplication.persist(HttpMethod.DELETE, mockData)).rejects.toThrow(
        'Current user pubky is not available',
      );
    });

    it('should throw when local remove fails', async () => {
      const mockData = createMockDeleteData();
      const { persistSpy, authSpy } = setupMocks();

      authSpy.mockReturnValue(mockAuthStore({ selectCurrentUserPubky: () => testUserId }));
      persistSpy.mockRejectedValue(new Error('Bookmark not found'));

      await expect(BookmarkApplication.persist(HttpMethod.DELETE, mockData)).rejects.toThrow('Bookmark not found');
      expect(persistSpy).toHaveBeenCalledOnce();
    });

    it('should throw when homeserver sync fails', async () => {
      const mockData = createMockDeleteData();
      const { persistSpy, requestSpy, authSpy } = setupMocks();

      authSpy.mockReturnValue(mockAuthStore({ selectCurrentUserPubky: () => testUserId }));
      persistSpy.mockResolvedValue(undefined);
      requestSpy.mockRejectedValue(new Error('Failed to DELETE from homeserver: 404'));

      await expect(BookmarkApplication.persist(HttpMethod.DELETE, mockData)).rejects.toThrow(
        'Failed to DELETE from homeserver: 404',
      );
      expect(persistSpy).toHaveBeenCalledOnce();
      expect(requestSpy).toHaveBeenCalledOnce();
    });
  });
});
