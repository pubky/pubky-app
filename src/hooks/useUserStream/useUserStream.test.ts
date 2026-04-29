import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useUserStream } from './useUserStream';
import { DEFAULT_USER_STREAM_LIMIT, DEFAULT_USER_STREAM_PAGE_SIZE } from './useUserStream.constants';
import { UserStreamTypes } from '@/models/stream/user/userStream.types';
const { mockUseLiveQuery, mockGetOrFetchStreamSlice } = vi.hoisted(() => ({
  mockUseLiveQuery: vi.fn(),
  mockGetOrFetchStreamSlice: vi.fn(),
}));

// Mock dexie-react-hooks
vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: (...args: unknown[]) => mockUseLiveQuery(...args),
}));

// Mock dependencies
vi.mock('@/controllers/stream/users/users', () => ({
  StreamUserController: {
    getOrFetchStreamSlice: (...args: unknown[]) => mockGetOrFetchStreamSlice(...args),
  },
}));
vi.mock('@/controllers/user/user', () => ({
  UserController: {
    getManyDetails: vi.fn().mockResolvedValue(new Map()),
    getManyCounts: vi.fn().mockResolvedValue(new Map()),
    getManyRelationships: vi.fn().mockResolvedValue(new Map()),
    getManyTagsOrFetch: vi.fn().mockResolvedValue(new Map()),
  },
}));
vi.mock('@/controllers/file/file', () => ({
  FileController: {
    getAvatarUrl: (id: string) => `https://cdn.example.com/avatar/${id}`,
  },
}));
vi.mock('@/models/stream/user/userStream.types', () => ({
  UserStreamTypes: {
    RECOMMENDED: 'recommended:all:all',
    TODAY_INFLUENCERS_ALL: 'influencers:today:all',
  },
}));

describe('useUserStream', () => {
  const mockUserDetails = new Map([
    [
      'user-1',
      {
        id: 'user-1',
        name: 'User One',
        bio: 'Bio one',
        image: 'image1.jpg',
        status: null,
      },
    ],
    [
      'user-2',
      {
        id: 'user-2',
        name: 'User Two',
        bio: 'Bio two',
        image: null,
        status: 'active',
      },
    ],
  ]);

  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock for useLiveQuery - returns the details map
    mockUseLiveQuery.mockReturnValue(mockUserDetails);
  });

  describe('initial loading', () => {
    it('returns loading state initially', () => {
      mockGetOrFetchStreamSlice.mockResolvedValue({ nextPageIds: [], skip: 0 });
      mockUseLiveQuery.mockReturnValue(new Map());

      const { result } = renderHook(() =>
        useUserStream({
          streamId: UserStreamTypes.RECOMMENDED,
        }),
      );

      expect(result.current.isLoading).toBe(true);
    });

    it('fetches initial data on mount', async () => {
      mockGetOrFetchStreamSlice.mockResolvedValue({
        nextPageIds: ['user-1', 'user-2'],
        skip: 2,
      });
      mockUseLiveQuery.mockReturnValue(mockUserDetails);

      const { result } = renderHook(() =>
        useUserStream({
          streamId: UserStreamTypes.RECOMMENDED,
          limit: 10,
        }),
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockGetOrFetchStreamSlice).toHaveBeenCalledWith({
        streamId: UserStreamTypes.RECOMMENDED,
        limit: 10,
        skip: 0,
      });
    });
  });

  describe('non-paginated mode', () => {
    it('uses default limit when not provided', async () => {
      mockGetOrFetchStreamSlice.mockResolvedValue({ nextPageIds: [], skip: 0 });
      mockUseLiveQuery.mockReturnValue(new Map());

      renderHook(() =>
        useUserStream({
          streamId: UserStreamTypes.RECOMMENDED,
        }),
      );

      await waitFor(() => {
        expect(mockGetOrFetchStreamSlice).toHaveBeenCalledWith(
          expect.objectContaining({
            limit: DEFAULT_USER_STREAM_LIMIT,
          }),
        );
      });
    });

    it('hasMore is false when not paginated', async () => {
      mockGetOrFetchStreamSlice.mockResolvedValue({
        nextPageIds: ['user-1'],
        skip: 1,
      });
      mockUseLiveQuery.mockReturnValue(mockUserDetails);

      const { result } = renderHook(() =>
        useUserStream({
          streamId: UserStreamTypes.RECOMMENDED,
          paginated: false,
        }),
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.hasMore).toBe(false);
    });
  });

  describe('paginated mode', () => {
    it('uses page size limit when paginated and no limit specified', async () => {
      mockGetOrFetchStreamSlice.mockResolvedValue({ nextPageIds: [], skip: 0 });
      mockUseLiveQuery.mockReturnValue(new Map());

      renderHook(() =>
        useUserStream({
          streamId: UserStreamTypes.RECOMMENDED,
          paginated: true,
        }),
      );

      await waitFor(() => {
        expect(mockGetOrFetchStreamSlice).toHaveBeenCalledWith(
          expect.objectContaining({
            limit: DEFAULT_USER_STREAM_PAGE_SIZE,
          }),
        );
      });
    });

    it('sets hasMore true when full page returned', async () => {
      const fullPage = Array.from({ length: DEFAULT_USER_STREAM_PAGE_SIZE }, (_, i) => `user-${i}`);
      mockGetOrFetchStreamSlice.mockResolvedValue({
        nextPageIds: fullPage,
        skip: DEFAULT_USER_STREAM_PAGE_SIZE,
      });
      mockUseLiveQuery.mockReturnValue(new Map());

      const { result } = renderHook(() =>
        useUserStream({
          streamId: UserStreamTypes.RECOMMENDED,
          paginated: true,
        }),
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.hasMore).toBe(true);
    });

    it('sets hasMore false when partial page returned', async () => {
      mockGetOrFetchStreamSlice.mockResolvedValue({
        nextPageIds: ['user-1', 'user-2'],
        skip: 2,
      });
      mockUseLiveQuery.mockReturnValue(new Map());

      const { result } = renderHook(() =>
        useUserStream({
          streamId: UserStreamTypes.RECOMMENDED,
          paginated: true,
        }),
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.hasMore).toBe(false);
    });

    it('loadMore fetches next page when hasMore is true', async () => {
      const fullPage = Array.from({ length: DEFAULT_USER_STREAM_PAGE_SIZE }, (_, i) => `user-${i}`);
      mockGetOrFetchStreamSlice
        .mockResolvedValueOnce({ nextPageIds: fullPage, skip: DEFAULT_USER_STREAM_PAGE_SIZE })
        .mockResolvedValueOnce({ nextPageIds: ['user-30', 'user-31'], skip: 32 });
      mockUseLiveQuery.mockReturnValue(new Map());

      const { result } = renderHook(() =>
        useUserStream({
          streamId: UserStreamTypes.RECOMMENDED,
          paginated: true,
        }),
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
        expect(result.current.hasMore).toBe(true);
      });

      await act(async () => {
        await result.current.loadMore();
      });

      expect(mockGetOrFetchStreamSlice).toHaveBeenCalledTimes(2);
      expect(mockGetOrFetchStreamSlice).toHaveBeenLastCalledWith({
        streamId: UserStreamTypes.RECOMMENDED,
        limit: DEFAULT_USER_STREAM_PAGE_SIZE,
        skip: DEFAULT_USER_STREAM_PAGE_SIZE,
      });
    });

    it('loadMore does nothing when hasMore is false', async () => {
      mockGetOrFetchStreamSlice.mockResolvedValue({
        nextPageIds: ['user-1'],
        skip: 1,
      });
      mockUseLiveQuery.mockReturnValue(new Map());

      const { result } = renderHook(() =>
        useUserStream({
          streamId: UserStreamTypes.RECOMMENDED,
          paginated: true,
        }),
      );

      await waitFor(() => {
        expect(result.current.hasMore).toBe(false);
      });

      await act(async () => {
        await result.current.loadMore();
      });

      // Should only be called once (initial fetch)
      expect(mockGetOrFetchStreamSlice).toHaveBeenCalledTimes(1);
    });
  });

  describe('error handling', () => {
    it('sets error state on fetch failure', async () => {
      mockGetOrFetchStreamSlice.mockRejectedValue(new Error('Network error'));
      mockUseLiveQuery.mockReturnValue(new Map());

      const { result } = renderHook(() =>
        useUserStream({
          streamId: UserStreamTypes.RECOMMENDED,
        }),
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBe('Failed to fetch users');
    });
  });

  describe('refetch', () => {
    it('refetch resets and fetches again', async () => {
      mockGetOrFetchStreamSlice.mockResolvedValue({
        nextPageIds: ['user-1'],
        skip: 1,
      });
      mockUseLiveQuery.mockReturnValue(new Map());

      const { result } = renderHook(() =>
        useUserStream({
          streamId: UserStreamTypes.RECOMMENDED,
        }),
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.refetch();
      });

      expect(mockGetOrFetchStreamSlice).toHaveBeenCalledTimes(2);
    });
  });
});
