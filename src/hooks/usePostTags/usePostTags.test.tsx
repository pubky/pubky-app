import { renderHook, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { usePostTags } from './usePostTags';

// Hoisted mock for fetchTags - must be defined before vi.mock
const { mockFetchTags } = vi.hoisted(() => ({
  mockFetchTags: vi.fn().mockResolvedValue([]),
}));

// Mock Core module
vi.mock('@/core', () => ({
  useAuthStore: vi.fn(() => vi.fn(() => 'mock-user-id')),
  PostController: {
    getTags: vi.fn().mockResolvedValue([]),
    fetchTags: mockFetchTags,
  },
  TagController: {
    commitCreate: vi.fn().mockResolvedValue(undefined),
    commitDelete: vi.fn().mockResolvedValue(undefined),
  },
  TagKind: {
    POST: 'post',
    USER: 'user',
  },
  FileController: {
    getAvatarUrl: vi.fn((id: string) => `https://avatar.test/${id}`),
  },
}));

// Mock dexie-react-hooks - returns undefined for loading state
vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: vi.fn(() => undefined),
}));

// Mock toast
vi.mock('@/molecules/Toaster/use-toast', () => ({
  toast: vi.fn(),
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

describe('usePostTags', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('initialization', () => {
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
      const Core = await import('@/core');

      vi.mocked(Core.useAuthStore).mockImplementation(() => null);
      vi.mocked(dexieHooks.useLiveQuery).mockReturnValue(undefined);

      const { result } = renderHook(() => usePostTags('author:post123'));

      const response = await result.current.handleTagAdd('test-tag');

      expect(response.success).toBe(false);
      expect(response.error).toBe('You must be logged in to add tags');
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
      const Core = await import('@/core');

      const mockViewerId = 'viewer-123';
      vi.mocked(Core.useAuthStore).mockImplementation(() => mockViewerId);

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
  });

  describe('loadMore pagination', () => {
    beforeEach(() => {
      mockFetchTags.mockClear();
    });

    it('should call fetchTags with correct skip value based on initial tags', async () => {
      const dexieHooks = await import('dexie-react-hooks');
      const Core = await import('@/core');

      vi.mocked(Core.useAuthStore).mockImplementation(() => 'viewer-123');

      // Initial tags from IndexedDB (simulating 25 tags already loaded)
      const initialTags = Array.from({ length: 25 }, (_, i) => ({
        label: `tag-${i}`,
        taggers_count: 1,
        taggers: ['user-1'],
        relationship: false,
      }));

      vi.mocked(dexieHooks.useLiveQuery).mockReturnValue([{ tags: initialTags }]);

      // fetchTags returns 10 new tags
      mockFetchTags.mockResolvedValueOnce(
        Array.from({ length: 10 }, (_, i) => ({
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
        limit: 10,
      });
    });

    it('should increment skip value by fetched count after each loadMore call', async () => {
      const dexieHooks = await import('dexie-react-hooks');
      const Core = await import('@/core');

      vi.mocked(Core.useAuthStore).mockImplementation(() => 'viewer-123');

      // Initial tags from IndexedDB
      const initialTags = Array.from({ length: 25 }, (_, i) => ({
        label: `tag-${i}`,
        taggers_count: 1,
        taggers: ['user-1'],
        relationship: false,
      }));

      vi.mocked(dexieHooks.useLiveQuery).mockReturnValue([{ tags: initialTags }]);

      // First loadMore returns 10 tags
      mockFetchTags.mockResolvedValueOnce(
        Array.from({ length: 10 }, (_, i) => ({
          label: `batch1-tag-${i}`,
          taggers_count: 1,
          taggers: ['user-1'],
        })),
      );

      // Second loadMore returns 10 tags
      mockFetchTags.mockResolvedValueOnce(
        Array.from({ length: 10 }, (_, i) => ({
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
        limit: 10,
      });

      // Second loadMore - skip should now be 35 (25 + 10)
      await result.current.loadMore();
      expect(mockFetchTags).toHaveBeenLastCalledWith({
        compositeId: 'author:post123',
        skip: 35,
        limit: 10,
      });
    });

    it('should set hasMore to false when fewer than TAGS_PER_PAGE tags are returned', async () => {
      const dexieHooks = await import('dexie-react-hooks');
      const Core = await import('@/core');

      vi.mocked(Core.useAuthStore).mockImplementation(() => 'viewer-123');

      const initialTags = [{ label: 'tag-1', taggers_count: 1, taggers: ['user-1'], relationship: false }];
      vi.mocked(dexieHooks.useLiveQuery).mockReturnValue([{ tags: initialTags }]);

      // Return fewer than 10 tags (end of list)
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
      const Core = await import('@/core');

      vi.mocked(Core.useAuthStore).mockImplementation(() => 'viewer-123');

      // Initial tags for first post
      const initialTags = Array.from({ length: 25 }, (_, i) => ({
        label: `tag-${i}`,
        taggers_count: 1,
        taggers: ['user-1'],
        relationship: false,
      }));

      vi.mocked(dexieHooks.useLiveQuery).mockReturnValue([{ tags: initialTags }]);

      mockFetchTags.mockResolvedValue(
        Array.from({ length: 10 }, (_, i) => ({
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
        limit: 10,
      });

      // Change postId - this should reset the skip
      const newPostTags = Array.from({ length: 15 }, (_, i) => ({
        label: `post2-tag-${i}`,
        taggers_count: 1,
        taggers: ['user-1'],
        relationship: false,
      }));
      vi.mocked(dexieHooks.useLiveQuery).mockReturnValue([{ tags: newPostTags }]);

      rerender({ postId: 'author:post2' });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Load more for second post - skip should be 15 (new post's tag count), not 35
      await result.current.loadMore();
      expect(mockFetchTags).toHaveBeenLastCalledWith({
        compositeId: 'author:post2',
        skip: 15,
        limit: 10,
      });
    });
  });
});
