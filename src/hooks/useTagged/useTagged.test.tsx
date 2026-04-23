import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useTagged } from './useTagged';
import * as Core from '@/core';

// Hoist mock functions before vi.mock
const mockMocks = vi.hoisted(() => {
  const mockGetTags = vi.fn();
  const mockFetchTags = vi.fn();
  const mockUpsertTags = vi.fn();
  const mockGetCounts = vi.fn();
  const mockTagCreate = vi.fn();
  const mockTagDelete = vi.fn();
  const mockToast = vi.fn();
  return {
    mockGetTags,
    mockFetchTags,
    mockUpsertTags,
    mockGetCounts,
    mockTagCreate,
    mockTagDelete,
    mockToast,
  };
});

// Mock Core modules
vi.mock('@/core', async () => {
  const actual = await vi.importActual<typeof import('@/core')>('@/core');
  return {
    ...actual,
    UserController: {
      getTags: mockMocks.mockGetTags,
      fetchTags: mockMocks.mockFetchTags,
      upsertTags: mockMocks.mockUpsertTags,
      getCounts: mockMocks.mockGetCounts,
    },
    TagController: {
      commitCreate: mockMocks.mockTagCreate,
      commitDelete: mockMocks.mockTagDelete,
    },
    useAuthStore: vi.fn(
      (selector?: (state: { currentUserPubky: string; selectCurrentUserPubky: () => string }) => unknown) => {
        const mockState = {
          currentUserPubky: 'mock-current-user',
          selectCurrentUserPubky: () => 'mock-current-user',
        };
        return selector ? selector(mockState) : mockState;
      },
    ),
  };
});

// Mock useProfileStats
import { useProfileStats } from '@/hooks/useProfileStats';
const mockUseProfileStats = vi.fn((_userId: string) => ({
  stats: { uniqueTags: 0, posts: 0, replies: 0, followers: 0, following: 0, friends: 0, notifications: 0 },
  isLoading: false,
}));
vi.mock('@/hooks/useProfileStats', () => ({
  useProfileStats: (...args: Parameters<typeof useProfileStats>) => mockUseProfileStats(...args),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: { label?: string }) => {
    switch (key) {
      case 'added':
        return 'Tag added';
      case 'addedDesc':
        return `"${values?.label}" was added successfully.`;
      case 'removed':
        return 'Tag removed';
      case 'removedDesc':
        return `"${values?.label}" was removed successfully.`;
      case 'addFailed':
        return 'Failed to add tag';
      case 'addFailedDesc':
        return `Could not add "${values?.label}". Please try again.`;
      case 'removeFailed':
        return 'Failed to remove tag';
      case 'removeFailedDesc':
        return `Could not remove "${values?.label}". Please try again.`;
      default:
        return key;
    }
  },
}));

// Mock toast
vi.mock('@/molecules/Toaster/use-toast', () => ({
  toast: mockMocks.mockToast,
}));

// Mock dexie-react-hooks
let mockLocalTags: Core.NexusTag[] | null = null;

const mockUseLiveQuery = vi.fn(<T,>(queryFn: () => Promise<T> | T, deps: unknown[], defaultValue: T): T => {
  // For getTags query
  if (deps && deps[0] && typeof deps[0] === 'string') {
    return (mockLocalTags !== null ? mockLocalTags : defaultValue) as T;
  }
  // For getCounts query (from useProfileStats)
  return defaultValue;
});

vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: <T,>(queryFn: () => Promise<T> | T, deps: unknown[], defaultValue: T): T =>
    mockUseLiveQuery(queryFn, deps, defaultValue) as T,
}));

describe('useTagged', () => {
  const mockUserId = 'test-user-pubky';

  beforeEach(() => {
    vi.clearAllMocks();
    mockLocalTags = null;
    mockMocks.mockGetTags.mockResolvedValue([]);
    mockMocks.mockFetchTags.mockResolvedValue([]);
    mockMocks.mockUpsertTags.mockResolvedValue(undefined);
    mockMocks.mockGetCounts.mockResolvedValue({
      tagged: 0,
      tags: 0,
      unique_tags: 0,
      posts: 0,
      replies: 0,
      following: 0,
      followers: 0,
      friends: 0,
      bookmarks: 0,
    });
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

  it('calls UserController.fetchTags with correct params', async () => {
    renderHook(() => useTagged(mockUserId));

    await waitFor(() => {
      expect(mockMocks.mockFetchTags).toHaveBeenCalled();
    });

    expect(mockMocks.mockFetchTags).toHaveBeenCalledWith({
      user_id: mockUserId,
      viewer_id: 'mock-current-user',
      limit_tags: 20,
      skip_tags: 0,
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
      taggedKind: Core.TagKind.USER,
    });
    expect(mockMocks.mockToast).toHaveBeenCalledWith({
      title: 'Tag added',
      description: '"ethereum" was added successfully.',
    });
  });

  it('shows an error toast when adding a tag fails', async () => {
    mockLocalTags = [];
    mockMocks.mockTagCreate.mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useTagged(mockUserId));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    let addResult: Awaited<ReturnType<typeof result.current.handleTagAdd>>;
    await act(async () => {
      addResult = await result.current.handleTagAdd('ethereum');
    });

    expect(addResult!).toEqual({ success: false, error: 'Failed to add tag' });
    expect(mockMocks.mockToast).toHaveBeenCalledWith({
      title: 'Failed to add tag',
      description: 'Could not add "ethereum". Please try again.',
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
      taggedKind: Core.TagKind.USER,
    });
    expect(mockMocks.mockToast).toHaveBeenCalledWith({
      title: 'Tag removed',
      description: '"bitcoin" was removed successfully.',
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

    it('sets hasMore to false when less than TAGS_PER_PAGE tags are loaded', async () => {
      // User has 10 unique tags (less than TAGS_PER_PAGE of 20)
      mockUseProfileStats.mockReturnValue({
        stats: { uniqueTags: 10, posts: 0, replies: 0, followers: 0, following: 0, friends: 0, notifications: 0 },
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

      // All tags are loaded, hasMore should be false
      expect(result.current.hasMore).toBe(false);
    });
  });
});
