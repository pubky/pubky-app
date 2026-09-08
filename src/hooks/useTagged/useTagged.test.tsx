import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TagKind } from '@/application/tag/tag.types';
import { useProfileStats } from '@/hooks/useProfileStats/useProfileStats';
import { NetworkErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { toast } from '@/molecules/Toaster/toast';
import type { NexusTag } from '@/services/nexus/nexus.types';
import { useTagged } from './useTagged';

// Hoist mock functions before vi.mock
const mockMocks = vi.hoisted(() => {
  const mockGetOrFetchTags = vi.fn();
  const mockTagCreate = vi.fn();
  const mockTagDelete = vi.fn();
  return {
    mockGetOrFetchTags,
    mockTagCreate,
    mockTagDelete,
  };
});

// Mock dependencies
vi.mock('@/controllers/tag/tag-cache', () => ({
  TagCacheController: { get: vi.fn(), getOrFetch: mockMocks.mockGetOrFetchTags, getOrFetchNext: vi.fn() },
}));
vi.mock('@/controllers/tag/tag', () => ({
  TagController: {
    commitCreate: mockMocks.mockTagCreate,
    commitDelete: mockMocks.mockTagDelete,
  },
}));
vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: vi.fn(
    (selector?: (state: { currentUserPubky: string; selectCurrentUserPubky: () => string }) => unknown) => {
      const mockState = {
        currentUserPubky: 'mock-current-user',
        selectCurrentUserPubky: () => 'mock-current-user',
      };
      return selector ? selector(mockState) : mockState;
    },
  ),
}));

// Mock useProfileStats
const defaultProfileStats = {
  stats: { uniqueTags: 0, posts: 0, replies: 0, followers: 0, following: 0, friends: 0, notifications: 0 },
  isLoading: false,
};
const mockUseProfileStats = vi.fn((_userId: string, _options?: unknown) => defaultProfileStats);
vi.mock('@/hooks/useProfileStats/useProfileStats', () => ({
  useProfileStats: (...args: Parameters<typeof useProfileStats>) => mockUseProfileStats(...args),
}));
// Mock toast
vi.mock('@/molecules/Toaster/toast');

// Mock dexie-react-hooks
let mockLocalTags: NexusTag[] | null = null;

vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: (_queryFn: () => unknown, deps: unknown[]) => {
    const id = deps[0];
    return typeof id === 'string' && mockLocalTags !== null ? { id, tags: mockLocalTags } : undefined;
  },
}));

describe('useTagged', () => {
  const mockUserId = 'test-user-pubky';

  it('rejects an existing viewer tag even when its tagger sample omits the viewer', async () => {
    mockLocalTags = [{ label: 'bitcoin', taggers: ['other'], taggers_count: 10, relationship: true }];
    const { result } = renderHook(() => useTagged(mockUserId));
    let outcome;
    await act(async () => {
      outcome = await result.current.handleTagAdd('BITCOIN');
    });
    expect(outcome).toEqual({ success: false, error: 'You have already added this tag' });
    expect(mockMocks.mockTagCreate).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockLocalTags = null;
    mockUseProfileStats.mockReturnValue(defaultProfileStats);
    mockMocks.mockGetOrFetchTags.mockResolvedValue(undefined);
    mockMocks.mockTagCreate.mockResolvedValue(undefined);
    mockMocks.mockTagDelete.mockResolvedValue(undefined);
  });

  it('returns empty data when userId is null', () => {
    const { result } = renderHook(() => useTagged(null));
    expect(result.current.tags).toHaveLength(0);
    expect(result.current.count).toBe(0);
    expect(result.current.hasMore).toBe(false);
    expect(result.current.isLoadingMore).toBe(false);
    expect(typeof result.current.handleTagAdd).toBe('function');
    expect(typeof result.current.handleTagToggle).toBe('function');
    expect(typeof result.current.loadMore).toBe('function');
  });

  it('returns empty data when userId is undefined', () => {
    const { result } = renderHook(() => useTagged(undefined));
    expect(result.current.tags).toHaveLength(0);
    expect(result.current.count).toBe(0);
    expect(result.current.hasMore).toBe(false);
    expect(result.current.isLoadingMore).toBe(false);
    expect(typeof result.current.handleTagAdd).toBe('function');
    expect(typeof result.current.handleTagToggle).toBe('function');
    expect(typeof result.current.loadMore).toBe('function');
  });

  it('requests local-first initialization with the correct viewer', async () => {
    renderHook(() => useTagged(mockUserId));

    await waitFor(() => {
      expect(mockMocks.mockGetOrFetchTags).toHaveBeenCalled();
    });

    expect(mockMocks.mockGetOrFetchTags).toHaveBeenCalledWith({
      kind: 'user',
      id: mockUserId,
      viewerId: 'mock-current-user',
    });
  });

  it('handleTagAdd returns error when tag label is empty', async () => {
    mockLocalTags = [];
    const { result } = renderHook(() => useTagged(mockUserId));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const addResult = await result.current.handleTagAdd('');

    expect(addResult.success).toBe(false);
    expect(addResult.error).toBe('Tag label cannot be empty');
  });

  it('handleTagAdd returns error when userId is null', async () => {
    const { result } = renderHook(() => useTagged(null));

    const addResult = await result.current.handleTagAdd('ethereum');

    expect(addResult.success).toBe(false);
    expect(addResult.error).toBe('User ID is required');
  });

  it('handleTagAdd calls TagController.create with correct params', async () => {
    mockLocalTags = [];
    const { result } = renderHook(() => useTagged(mockUserId));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    let addResult: Awaited<ReturnType<typeof result.current.handleTagAdd>>;
    await act(async () => {
      addResult = await result.current.handleTagAdd('ethereum');
    });

    expect(addResult!.success).toBe(true);
    expect(mockMocks.mockTagCreate).toHaveBeenCalledWith({
      taggedId: mockUserId,
      label: 'ethereum',
      taggerId: 'mock-current-user',
      taggedKind: TagKind.USER,
    });
    expect(vi.mocked(toast)).toHaveBeenCalledWith({
      title: 'Tag added',
    });
  });

  it('shows an error toast when adding a tag fails', async () => {
    mockLocalTags = [];
    mockMocks.mockTagCreate.mockRejectedValueOnce(
      Err.network(NetworkErrorCode.CONNECTION_FAILED, 'Network error', {
        service: ErrorService.Nexus,
        operation: 'commitTag',
      }),
    );

    const { result } = renderHook(() => useTagged(mockUserId));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    let addResult: Awaited<ReturnType<typeof result.current.handleTagAdd>>;
    await act(async () => {
      addResult = await result.current.handleTagAdd('ethereum');
    });

    expect(addResult!).toEqual({ success: false, error: 'Failed to add tag' });
    expect(vi.mocked(toast)).toHaveBeenCalledWith({
      variant: 'error',
      description: 'Could not add tag',
    });
  });

  it('shows a success toast when removing a tag', async () => {
    mockLocalTags = [
      {
        label: 'bitcoin',
        taggers: ['mock-current-user'],
        taggers_count: 1,
        relationship: true,
      },
    ];

    const { result } = renderHook(() => useTagged(mockUserId));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.handleTagToggle({ label: 'bitcoin', relationship: true });
    });

    expect(mockMocks.mockTagDelete).toHaveBeenCalledWith({
      taggedId: mockUserId,
      label: 'bitcoin',
      taggerId: 'mock-current-user',
      taggedKind: TagKind.USER,
    });
    expect(vi.mocked(toast)).toHaveBeenCalledWith({
      title: 'Tag removed',
    });
  });

  it('shows an error toast when removing a tag fails', async () => {
    mockLocalTags = [
      {
        label: 'bitcoin',
        taggers: ['mock-current-user'],
        taggers_count: 1,
        relationship: true,
      },
    ];
    mockMocks.mockTagDelete.mockRejectedValueOnce(
      Err.network(NetworkErrorCode.CONNECTION_FAILED, 'Network error', {
        service: ErrorService.Nexus,
        operation: 'commitTag',
      }),
    );

    const { result } = renderHook(() => useTagged(mockUserId));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.handleTagToggle({ label: 'bitcoin', relationship: true });
    });

    expect(vi.mocked(toast)).toHaveBeenCalledWith({
      variant: 'error',
      description: 'Could not remove tag',
    });
  });

  describe('hasMore calculation', () => {
    it('sets hasMore to true when loaded tags is less than total unique_tags count', async () => {
      // User has 30 unique tags, but only 20 are loaded initially
      mockUseProfileStats.mockReturnValue({
        stats: { uniqueTags: 30, posts: 0, replies: 0, followers: 0, following: 0, friends: 0, notifications: 0 },
        isLoading: false,
      });

      // Simulate 20 tags loaded from IndexedDB
      mockLocalTags = Array.from({ length: 20 }, (_, i) => ({
        label: `tag-${i}`,
        taggers: ['tagger-1'],
        taggers_count: 1,
        relationship: false,
      }));

      const { result } = renderHook(() => useTagged(mockUserId));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Should have more tags to load since 20 < 30
      expect(result.current.hasMore).toBe(true);
    });

    it('sets hasMore to false when loaded tags equals total unique_tags count', async () => {
      // User has 20 unique tags and all 20 are loaded
      mockUseProfileStats.mockReturnValue({
        stats: { uniqueTags: 20, posts: 0, replies: 0, followers: 0, following: 0, friends: 0, notifications: 0 },
        isLoading: false,
      });

      // Simulate 20 tags loaded from IndexedDB
      mockLocalTags = Array.from({ length: 20 }, (_, i) => ({
        label: `tag-${i}`,
        taggers: ['tagger-1'],
        taggers_count: 1,
        relationship: false,
      }));

      const { result } = renderHook(() => useTagged(mockUserId));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Should NOT have more tags since all 20 are loaded
      expect(result.current.hasMore).toBe(false);
    });

    it('sets hasMore to false when loaded tags exceeds total unique_tags count', async () => {
      // Edge case: local count higher than API count (stale data)
      mockUseProfileStats.mockReturnValue({
        stats: { uniqueTags: 15, posts: 0, replies: 0, followers: 0, following: 0, friends: 0, notifications: 0 },
        isLoading: false,
      });

      mockLocalTags = Array.from({ length: 20 }, (_, i) => ({
        label: `tag-${i}`,
        taggers: ['tagger-1'],
        taggers_count: 1,
        relationship: false,
      }));

      const { result } = renderHook(() => useTagged(mockUserId));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.hasMore).toBe(false);
    });

    it('sets hasMore to false when pagination is disabled', async () => {
      mockUseProfileStats.mockReturnValue({
        stats: { uniqueTags: 30, posts: 0, replies: 0, followers: 0, following: 0, friends: 0, notifications: 0 },
        isLoading: false,
      });

      mockLocalTags = Array.from({ length: 20 }, (_, i) => ({
        label: `tag-${i}`,
        taggers: ['tagger-1'],
        taggers_count: 1,
        relationship: false,
      }));

      const { result } = renderHook(() => useTagged(mockUserId, { enablePagination: false }));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Pagination is disabled, so hasMore should be false regardless of count
      expect(result.current.hasMore).toBe(false);
    });

    it('allows pagination when less than a full page is cached', async () => {
      // Only 10 of 30 tags are cached.
      mockUseProfileStats.mockReturnValue({
        stats: { uniqueTags: 30, posts: 0, replies: 0, followers: 0, following: 0, friends: 0, notifications: 0 },
        isLoading: false,
      });

      mockLocalTags = Array.from({ length: 10 }, (_, i) => ({
        label: `tag-${i}`,
        taggers: ['tagger-1'],
        taggers_count: 1,
        relationship: false,
      }));

      const { result } = renderHook(() => useTagged(mockUserId));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // The remaining tags are reachable even from a partial preview.
      expect(result.current.hasMore).toBe(true);
    });
  });
});
