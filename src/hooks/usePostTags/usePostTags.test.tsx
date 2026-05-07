import { act, renderHook, waitFor } from '@testing-library/react';
import * as DexieHooks from 'dexie-react-hooks';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TagController } from '@/controllers/tag/tag';
import { useAuthStore } from '@/stores/auth/auth.store';
import type { AuthStore } from '@/stores/auth/auth.types';
import { mockAuthStore } from '@/test-utils/stores';
import { usePostTags } from './usePostTags';
import { TAGS_PER_PAGE } from './usePostTags.constants';

// Hoisted mock for fetchTags - must be defined before vi.mock
const { mockFetchTags, mockToast, mockAuthStoreSelector } = vi.hoisted(() => ({
  mockFetchTags: vi.fn().mockResolvedValue([]),
  mockToast: vi.fn(),
  mockAuthStoreSelector: (currentUserPubky: string | null) => {
    return (selector: (state: AuthStore) => unknown) => selector(mockAuthStore({ currentUserPubky }));
  },
}));

// Mock dependencies
vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: vi.fn(mockAuthStoreSelector('mock-user-id')),
}));
vi.mock('@/controllers/post/post', () => ({
  PostController: {
    getTags: vi.fn().mockResolvedValue([]),
    getCounts: vi.fn().mockResolvedValue(null),
    fetchTags: mockFetchTags,
  },
}));
vi.mock('@/controllers/tag/tag', () => ({
  TagController: {
    commitCreate: vi.fn().mockResolvedValue(undefined),
    commitDelete: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock('@/application/tag/tag.types', () => ({
  TagKind: {
    POST: 'post',
    USER: 'user',
  },
}));
vi.mock('@/controllers/file/file', () => ({
  FileController: {
    getAvatarUrl: vi.fn((id: string) => `https://avatar.test/${id}`),
  },
}));

// Mock dexie-react-hooks - returns undefined for loading state
vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: vi.fn(() => undefined),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: { label?: string }) => {
    switch (key) {
      case 'loadFailed':
        return 'Failed to load more tags';
      case 'loadFailedDesc':
        return 'Could not load more tags. Please try again.';
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
  toast: mockToast,
}));

// Mock tag transformation utilities
vi.mock('@/molecules/TaggedItem/TaggedItem.utils', () => ({
  transformTagWithAvatars: vi.fn((tag) => ({
    ...tag,
    taggers: tag.taggers?.map((id: string) => ({ id, avatarUrl: `https://avatar.test/${id}` })) ?? [],
  })),
  transformTagsForViewer: vi.fn((tags) =>
    tags
      .filter((tag: { label?: string }) => tag.label)
      .map((tag: { label: string; taggers?: string[] }) => ({
        ...tag,
        taggers: tag.taggers?.map((id: string) => ({ id, avatarUrl: `https://avatar.test/${id}` })) ?? [],
      })),
  ),
}));

/**
 * Helper to mock useLiveQuery returning different values for its two call sites:
 *   - PostController.getTags  → tagsValue
 *   - PostController.getCounts → countsValue
 *
 * The mapping is based on the query factory function content rather than call
 * order, so the mock stays correct even if a future change reorders or adds
 * additional useLiveQuery calls in the hook.
 */
function setupLiveQueryMock(dexieHooks: typeof import('dexie-react-hooks'), tagsValue: unknown, countsValue: unknown) {
  vi.mocked(dexieHooks.useLiveQuery).mockImplementation((queryFn) => {
    const fnStr = queryFn.toString();
    if (fnStr.includes('getTags')) return tagsValue;
    if (fnStr.includes('getCounts')) return countsValue;
    return undefined;
  });
}

describe('usePostTags', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuthStore).mockImplementation(mockAuthStoreSelector('mock-user-id'));
    vi.mocked(DexieHooks.useLiveQuery).mockReturnValue(undefined);
  });

  describe('initialization', () => {
    it('should fetch initial tags from Nexus on mount', async () => {
      renderHook(() => usePostTags('author:post123'));

      await waitFor(() => {
        expect(mockFetchTags).toHaveBeenCalledWith({
          compositeId: 'author:post123',
          skip: 0,
          limit: TAGS_PER_PAGE,
          viewerId: 'mock-user-id',
        });
      });
    });

    it('should return loading state initially', () => {
      const { result } = renderHook(() => usePostTags('author:post123'));

      expect(result.current.isLoading).toBe(true);
      expect(result.current.tags).toEqual([]);
      expect(result.current.count).toBe(0);
    });

    it('should return empty tags when postId is null', () => {
      const { result } = renderHook(() => usePostTags(null));

      expect(result.current.tags).toEqual([]);
      expect(result.current.count).toBe(0);
    });

    it('should return empty tags when postId is undefined', () => {
      const { result } = renderHook(() => usePostTags(undefined));

      expect(result.current.tags).toEqual([]);
      expect(result.current.count).toBe(0);
    });

    it('should return empty tags when no tags exist', async () => {
      const { result } = renderHook(() => usePostTags('author:post123'));

      await waitFor(() => {
        expect(result.current.tags).toEqual([]);
        expect(result.current.count).toBe(0);
      });
    });
  });

  describe('handleTagAdd', () => {
    it('should return error for empty tag label', async () => {
      const { result } = renderHook(() => usePostTags('author:post123'));

      const response = await result.current.handleTagAdd('');

      expect(response.success).toBe(false);
      expect(response.error).toBe('Tag label cannot be empty');
    });

    it('should return error when not logged in', async () => {
      // Mock useAuthStore to return null (not logged in)
      const dexieHooks = await import('dexie-react-hooks');

      vi.mocked(useAuthStore).mockImplementation(mockAuthStoreSelector(null));
      vi.mocked(dexieHooks.useLiveQuery).mockReturnValue(undefined);

      const { result } = renderHook(() => usePostTags('author:post123'));

      const response = await result.current.handleTagAdd('test-tag');

      expect(response.success).toBe(false);
      expect(response.error).toBe('You must be logged in to add tags');
    });

    it('shows a success toast when a tag is added', async () => {
      const { result } = renderHook(() => usePostTags('author:post123'));

      let response: Awaited<ReturnType<typeof result.current.handleTagAdd>>;
      await act(async () => {
        response = await result.current.handleTagAdd('test-tag');
      });

      expect(response!).toEqual({ success: true });
      expect(mockToast).toHaveBeenCalledWith({
        title: 'Tag added',
        description: '"test-tag" was added successfully.',
      });
    });

    it('shows an error toast when adding a tag fails', async () => {
      vi.mocked(TagController.commitCreate).mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => usePostTags('author:post123'));

      let response: Awaited<ReturnType<typeof result.current.handleTagAdd>>;
      await act(async () => {
        response = await result.current.handleTagAdd('broken-tag');
      });

      expect(response!).toEqual({ success: false, error: 'Failed to add tag' });
      expect(mockToast).toHaveBeenCalledWith({
        title: 'Failed to add tag',
        description: 'Could not add "broken-tag". Please try again.',
      });
    });
  });

  describe('handleTagToggle', () => {
    it('should not throw when postId is null', async () => {
      const { result } = renderHook(() => usePostTags(null));

      await expect(result.current.handleTagToggle({ label: 'test' })).resolves.not.toThrow();
    });

    it('should preserve tag with zero count when last tagger removes their tag', async () => {
      // Setup: Mock a tag with count=1 where the viewer is the tagger
      const dexieHooks = await import('dexie-react-hooks');

      const mockViewerId = 'viewer-123';
      vi.mocked(useAuthStore).mockImplementation(mockAuthStoreSelector(mockViewerId));

      // Tag with count=1 where viewer is the tagger
      const tagWithOneCount = {
        label: 'solo-tag',
        taggers_count: 1,
        taggers: [mockViewerId],
        relationship: true,
      };

      // Return the tag in useLiveQuery
      vi.mocked(dexieHooks.useLiveQuery).mockReturnValue([{ tags: [tagWithOneCount] }]);

      const { result, rerender } = renderHook(() => usePostTags('author:post123'));

      // Verify initial state - tag should be present
      expect(result.current.tags).toHaveLength(1);
      expect(result.current.tags[0].label).toBe('solo-tag');
      expect(result.current.tags[0].taggers_count).toBe(1);

      // Toggle (remove) the tag
      await result.current.handleTagToggle({ label: 'solo-tag', relationship: true });

      // After delete, simulate IndexedDB returning empty (tag removed from DB)
      vi.mocked(dexieHooks.useLiveQuery).mockReturnValue([{ tags: [] }]);
      rerender();

      // BUG: Currently the tag disappears.
      // EXPECTED: Tag should remain visible with taggers_count: 0
      expect(result.current.tags).toHaveLength(1);
      expect(result.current.tags[0].label).toBe('solo-tag');
      expect(result.current.tags[0].taggers_count).toBe(0);
      expect(result.current.tags[0].relationship).toBe(false);
    });

    it('shows a success toast when removing a tag', async () => {
      const dexieHooks = await import('dexie-react-hooks');

      const mockViewerId = 'viewer-123';
      vi.mocked(useAuthStore).mockImplementation(mockAuthStoreSelector(mockViewerId));
      vi.mocked(dexieHooks.useLiveQuery).mockReturnValue([
        {
          tags: [{ label: 'solo-tag', taggers_count: 1, taggers: [mockViewerId], relationship: true }],
        },
      ]);

      const { result } = renderHook(() => usePostTags('author:post123'));

      await act(async () => {
        await result.current.handleTagToggle({ label: 'solo-tag', relationship: true });
      });

      expect(mockToast).toHaveBeenCalledWith({
        title: 'Tag removed',
        description: '"solo-tag" was removed successfully.',
      });
    });
  });

  describe('loadMore pagination', () => {
    beforeEach(() => {
      mockFetchTags.mockClear();
    });

    it('should call fetchTags with correct skip value based on initial tags', async () => {
      const dexieHooks = await import('dexie-react-hooks');

      vi.mocked(useAuthStore).mockImplementation(mockAuthStoreSelector('viewer-123'));

      // Initial tags from IndexedDB (simulating 25 tags already loaded)
      const initialTags = Array.from({ length: 25 }, (_, i) => ({
        label: `tag-${i}`,
        taggers_count: 1,
        taggers: ['user-1'],
        relationship: false,
      }));

      // hasMore is derived from postCounts.unique_tags > localTags.length
      setupLiveQueryMock(dexieHooks, [{ tags: initialTags }], { unique_tags: 50 });

      // fetchTags returns a full page of new tags
      mockFetchTags.mockResolvedValueOnce(
        Array.from({ length: TAGS_PER_PAGE }, (_, i) => ({
          label: `new-tag-${i}`,
          taggers_count: 1,
          taggers: ['user-1'],
        })),
      );

      const { result } = renderHook(() => usePostTags('author:post123'));

      // Wait for initial load
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Call loadMore
      await result.current.loadMore();

      // Should have called fetchTags with skip=25 (initial tag count)
      expect(mockFetchTags).toHaveBeenCalledWith({
        compositeId: 'author:post123',
        skip: 25,
        limit: TAGS_PER_PAGE,
        viewerId: 'viewer-123',
      });
    });

    it('should increment skip value by fetched count after each loadMore call', async () => {
      const dexieHooks = await import('dexie-react-hooks');

      vi.mocked(useAuthStore).mockImplementation(mockAuthStoreSelector('viewer-123'));

      // Initial tags from IndexedDB
      const initialTags = Array.from({ length: 25 }, (_, i) => ({
        label: `tag-${i}`,
        taggers_count: 1,
        taggers: ['user-1'],
        relationship: false,
      }));

      // hasMore is derived from postCounts.unique_tags > localTags.length
      setupLiveQueryMock(dexieHooks, [{ tags: initialTags }], { unique_tags: 100 });

      // First loadMore returns a full page of tags
      mockFetchTags.mockResolvedValueOnce(
        Array.from({ length: TAGS_PER_PAGE }, (_, i) => ({
          label: `batch1-tag-${i}`,
          taggers_count: 1,
          taggers: ['user-1'],
        })),
      );

      // Second loadMore returns a full page of tags
      mockFetchTags.mockResolvedValueOnce(
        Array.from({ length: TAGS_PER_PAGE }, (_, i) => ({
          label: `batch2-tag-${i}`,
          taggers_count: 1,
          taggers: ['user-1'],
        })),
      );

      const { result } = renderHook(() => usePostTags('author:post123'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // First loadMore
      await result.current.loadMore();
      expect(mockFetchTags).toHaveBeenLastCalledWith({
        compositeId: 'author:post123',
        skip: 25,
        limit: TAGS_PER_PAGE,
        viewerId: 'viewer-123',
      });

      // Second loadMore - skip should now be 25 + TAGS_PER_PAGE
      await result.current.loadMore();
      expect(mockFetchTags).toHaveBeenLastCalledWith({
        compositeId: 'author:post123',
        skip: 25 + TAGS_PER_PAGE,
        limit: TAGS_PER_PAGE,
        viewerId: 'viewer-123',
      });
    });

    it('should set hasMore to false when fewer than TAGS_PER_PAGE tags are returned', async () => {
      const dexieHooks = await import('dexie-react-hooks');

      vi.mocked(useAuthStore).mockImplementation(mockAuthStoreSelector('viewer-123'));

      const initialTags = [{ label: 'tag-1', taggers_count: 1, taggers: ['user-1'], relationship: false }];
      // unique_tags > localTags.length so hasMore starts as true
      setupLiveQueryMock(dexieHooks, [{ tags: initialTags }], { unique_tags: 20 });

      // Initial fetch on mount should return a full page so hasMore remains true.
      mockFetchTags.mockResolvedValueOnce(
        Array.from({ length: TAGS_PER_PAGE }, (_, i) => ({
          label: `initial-tag-${i}`,
          taggers_count: 1,
          taggers: ['user-1'],
        })),
      );

      // Then loadMore returns fewer than 10 tags (end of list)
      mockFetchTags.mockResolvedValueOnce([
        { label: 'last-tag-1', taggers_count: 1, taggers: ['user-1'] },
        { label: 'last-tag-2', taggers_count: 1, taggers: ['user-1'] },
      ]);

      const { result } = renderHook(() => usePostTags('author:post123'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.hasMore).toBe(true);

      await result.current.loadMore();

      // hasMore should now be false since we got < 10 tags
      await waitFor(() => {
        expect(result.current.hasMore).toBe(false);
      });
    });

    it('should reset skip value when postId changes', async () => {
      const dexieHooks = await import('dexie-react-hooks');

      vi.mocked(useAuthStore).mockImplementation(mockAuthStoreSelector('viewer-123'));

      // Initial tags for first post
      const initialTags = Array.from({ length: 25 }, (_, i) => ({
        label: `tag-${i}`,
        taggers_count: 1,
        taggers: ['user-1'],
        relationship: false,
      }));

      setupLiveQueryMock(dexieHooks, [{ tags: initialTags }], { unique_tags: 50 });

      mockFetchTags.mockResolvedValue(
        Array.from({ length: TAGS_PER_PAGE }, (_, i) => ({
          label: `new-tag-${i}`,
          taggers_count: 1,
          taggers: ['user-1'],
        })),
      );

      const { result, rerender } = renderHook(({ postId }) => usePostTags(postId), {
        initialProps: { postId: 'author:post1' },
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Load more for first post
      await result.current.loadMore();
      expect(mockFetchTags).toHaveBeenLastCalledWith({
        compositeId: 'author:post1',
        skip: 25,
        limit: TAGS_PER_PAGE,
        viewerId: 'viewer-123',
      });

      // Change postId - this should reset the skip
      const newPostTags = Array.from({ length: 15 }, (_, i) => ({
        label: `post2-tag-${i}`,
        taggers_count: 1,
        taggers: ['user-1'],
        relationship: false,
      }));
      setupLiveQueryMock(dexieHooks, [{ tags: newPostTags }], { unique_tags: 50 });

      rerender({ postId: 'author:post2' });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Load more for second post - skip should be 15 (new post's tag count), not 35
      await result.current.loadMore();
      expect(mockFetchTags).toHaveBeenLastCalledWith({
        compositeId: 'author:post2',
        skip: 15,
        limit: TAGS_PER_PAGE,
        viewerId: 'viewer-123',
      });
    });
  });
});
