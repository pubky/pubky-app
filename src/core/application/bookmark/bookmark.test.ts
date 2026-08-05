import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpMethod } from '@/libs/http/http.types';
import type { Pubky } from '@/models/models.types';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { LocalBookmarkService } from '@/services/local/bookmark/bookmark';
import { useAuthStore } from '@/stores/auth/auth.store';
import { mockAuthStore } from '@/test-utils/stores';
import { BookmarkApplication } from './bookmark';
import type { TCreateBookmarkInput, TDeleteBookmarkInput } from './bookmark.types';

// Mock the LocalBookmarkService
vi.mock('@/services/local/bookmark/bookmark', () => ({
  LocalBookmarkService: {
    persist: vi.fn(),
    getAllBookmarksSorted: vi.fn(),
  },
}));

// Mock the HomeserverService
vi.mock('@/services/homeserver/homeserver', () => ({
  HomeserverService: {
    request: vi.fn(),
  },
}));

describe('BookmarkApplication', () => {
  const testUserId = 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo' as Pubky;

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
    persistSpy: vi.spyOn(LocalBookmarkService, 'persist'),
    requestSpy: vi.spyOn(HomeserverService, 'request'),
    authSpy: vi.spyOn(useAuthStore, 'getState'),
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getAll', () => {
    it('delegates to LocalBookmarkService.getAllBookmarksSorted and returns its result', async () => {
      const sortedIds = ['authorA:p1', 'authorB:p2', 'authorC:p3'];
      const spy = vi.spyOn(LocalBookmarkService, 'getAllBookmarksSorted').mockResolvedValue(sortedIds);

      const result = await BookmarkApplication.getAll();

      expect(spy).toHaveBeenCalledTimes(1);
      expect(result).toEqual(sortedIds);
    });

    it('returns an empty array when no bookmarks are stored locally', async () => {
      vi.spyOn(LocalBookmarkService, 'getAllBookmarksSorted').mockResolvedValue([]);

      const result = await BookmarkApplication.getAll();

      expect(result).toEqual([]);
    });
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
      const { persistSpy, requestSpy, authSpy } = setupMocks();

      authSpy.mockReturnValue(mockAuthStore({ selectCurrentUserPubky: () => testUserId }));
      persistSpy.mockRejectedValue(new Error('Database error'));

      await expect(BookmarkApplication.persist(HttpMethod.PUT, mockData)).rejects.toThrow('Database error');
      expect(persistSpy).toHaveBeenCalledOnce();
      expect(requestSpy).not.toHaveBeenCalled();
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
      const { persistSpy, requestSpy, authSpy } = setupMocks();

      authSpy.mockReturnValue(mockAuthStore({ selectCurrentUserPubky: () => testUserId }));
      persistSpy.mockRejectedValue(new Error('Bookmark not found'));

      await expect(BookmarkApplication.persist(HttpMethod.DELETE, mockData)).rejects.toThrow('Bookmark not found');
      expect(persistSpy).toHaveBeenCalledOnce();
      expect(requestSpy).not.toHaveBeenCalled();
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

    it('should finish the local removal before syncing to the homeserver', async () => {
      const mockData = createMockDeleteData();
      const { persistSpy, requestSpy, authSpy } = setupMocks();
      let resolveLocalRemoval: (() => void) | undefined;
      const localRemoval = new Promise<void>((resolve) => {
        resolveLocalRemoval = resolve;
      });

      authSpy.mockReturnValue(mockAuthStore({ selectCurrentUserPubky: () => testUserId }));
      persistSpy.mockReturnValue(localRemoval);
      requestSpy.mockResolvedValue(undefined);

      const persist = BookmarkApplication.persist(HttpMethod.DELETE, mockData);
      await Promise.resolve();

      expect(requestSpy).not.toHaveBeenCalled();

      resolveLocalRemoval?.();
      await persist;

      expect(requestSpy).toHaveBeenCalledOnce();
    });
  });
});
