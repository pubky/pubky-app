import { act, renderHook, waitFor } from '@testing-library/react';
import { useLiveQuery } from 'dexie-react-hooks';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PostController } from '@/controllers/post/post';
import { TagController } from '@/controllers/tag/tag';
import { NetworkErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { toast } from '@/molecules/Toaster/toast';
import type { NexusTag } from '@/services/nexus/nexus.types';
import { useAuthStore } from '@/stores/auth/auth.store';
import type { AuthStore } from '@/stores/auth/auth.types';
import { mockAuthStore } from '@/test-utils/stores';
import { usePostTags } from './usePostTags';

// Hoisted I/O and auth mocks
const { mockGetOrFetchTags, mockAuthStoreSelector } = vi.hoisted(() => ({
  mockGetOrFetchTags: vi.fn().mockResolvedValue(undefined),
  mockAuthStoreSelector: (currentUserPubky: string | null) => {
    return (selector: (state: AuthStore) => unknown) => selector(mockAuthStore({ currentUserPubky }));
  },
}));

// Mock dependencies
vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: vi.fn(mockAuthStoreSelector('mock-user-id')),
}));
vi.mock('@/controllers/tag/tag-cache', () => ({
  TagCacheController: { get: vi.fn(), getOrFetch: mockGetOrFetchTags, getOrFetchNext: vi.fn() },
}));
vi.mock('@/controllers/post/post', () => ({
  PostController: {
    getCounts: vi.fn().mockResolvedValue(null),
  },
}));
vi.mock('@/controllers/tag/tag', () => ({
  TagController: {
    commitCreate: vi.fn().mockResolvedValue(undefined),
    commitDelete: vi.fn().mockResolvedValue(undefined),
  },
}));
// Mock dexie-react-hooks - returns undefined for loading state
vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: vi.fn(() => undefined),
}));
// Mock toast
vi.mock('@/molecules/Toaster/toast');

/**
 * Helper to mock useLiveQuery returning different values for its two call sites:
 *   - TagCacheController.get → tagsValue
 *   - PostController.getCounts → countsValue
 *
 * Tag observations depend on ID and kind; counts depend only on ID.
 * Route by those query dependencies without inspecting function source text.
 */
function setupLiveQueryMock(tagsValue: { tags: NexusTag[] } | undefined, countsValue: unknown) {
  vi.mocked(useLiveQuery).mockImplementation((_queryFn, deps) => {
    if (deps?.length === 2) return tagsValue ? { id: 'author:post123', tags: tagsValue.tags } : undefined;
    if (deps?.length === 1) return countsValue;
    return undefined;
  });
}

describe('usePostTags', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuthStore).mockImplementation(mockAuthStoreSelector('mock-user-id'));
    vi.mocked(useLiveQuery).mockReturnValue(undefined);
  });

  it('rejects an existing viewer tag even when its tagger sample omits the viewer', async () => {
    setupLiveQueryMock(
      { tags: [{ label: 'bitcoin', taggers: ['other'], taggers_count: 10, relationship: true }] },
      null,
    );
    const { result } = renderHook(() => usePostTags('author:post123'));
    let outcome;
    await act(async () => {
      outcome = await result.current.handleTagAdd('BITCOIN');
    });
    expect(outcome).toEqual({ success: false, error: 'You have already added this tag' });
    expect(TagController.commitCreate).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
  });

  it('contains a counts read failure while keeping cached tag chips visible', async () => {
    setupLiveQueryMock({ tags: [{ label: 'cached', taggers: [], taggers_count: 1, relationship: false }] }, null);
    vi.mocked(PostController.getCounts).mockRejectedValueOnce(new Error('IndexedDB unavailable'));
    const { result } = renderHook(() => usePostTags('author:post123'));
    const query = vi.mocked(useLiveQuery).mock.calls.find(([, deps]) => deps?.length === 1)![0];
    await expect(query()).resolves.toBeNull();
    expect(result.current.tags.map((tag) => tag.label)).toEqual(['cached']);
    expect(result.current.hasMore).toBe(false);
  });

  it('discards zero-tagger placeholders when the viewer changes on the same post', async () => {
    const tag = { label: 'solo', taggers: ['mock-user-id'], taggers_count: 1, relationship: true };
    setupLiveQueryMock({ tags: [tag] }, { unique_tags: 1 });
    const { result, rerender } = renderHook(() => usePostTags('author:post123'));
    await act(async () => result.current.handleTagToggle(tag));
    setupLiveQueryMock({ tags: [] }, { unique_tags: 0 });
    rerender();
    expect(result.current.tags).toEqual([expect.objectContaining({ label: 'solo', taggers_count: 0 })]);
    vi.mocked(useAuthStore).mockImplementation(mockAuthStoreSelector('other-viewer'));
    rerender();
    expect(result.current.tags).toEqual([]);
  });

  it("does not pin a previous viewer's late tag creation or show its toast", async () => {
    const pending = Promise.withResolvers<void>();
    vi.mocked(TagController.commitCreate).mockReturnValueOnce(pending.promise);
    const tags = [
      { label: 'first', taggers: [], taggers_count: 2, relationship: false },
      { label: 'slow', taggers: [], taggers_count: 1, relationship: false },
    ];
    setupLiveQueryMock({ tags }, { unique_tags: 2 });
    const { result, rerender } = renderHook(() => usePostTags('author:post123'));
    let add!: Promise<unknown>;
    act(() => {
      add = result.current.handleTagAdd('slow');
    });
    vi.mocked(useAuthStore).mockImplementation(mockAuthStoreSelector('other-viewer'));
    rerender();
    await act(async () => {
      pending.resolve();
      await add;
    });
    expect(result.current.tags.map((tag) => tag.label)).toEqual(['first', 'slow']);
    expect(toast).not.toHaveBeenCalled();
  });

  it("keeps the new viewer's tag pinned when an earlier removal finishes", async () => {
    const pending = Promise.withResolvers<void>();
    vi.mocked(TagController.commitDelete).mockReturnValueOnce(pending.promise);
    const tags = [
      { label: 'first', taggers: ['other'], taggers_count: 5, relationship: false },
      { label: 'shared', taggers: ['mock-user-id', 'other'], taggers_count: 2, relationship: true },
    ];
    setupLiveQueryMock({ tags }, { unique_tags: 2 });
    const { result, rerender } = renderHook(() => usePostTags('author:post123'));
    let removal!: Promise<void>;
    act(() => {
      removal = result.current.handleTagToggle({ label: 'shared', relationship: true });
    });

    vi.mocked(useAuthStore).mockImplementation(mockAuthStoreSelector('new-viewer'));
    setupLiveQueryMock({ tags: tags.map((tag) => ({ ...tag, relationship: false })) }, { unique_tags: 2 });
    rerender();
    await act(async () => {
      await result.current.handleTagAdd('shared');
    });
    expect(result.current.tags.map((tag) => tag.label)).toEqual(['shared', 'first']);

    await act(async () => {
      pending.resolve();
      await removal;
    });
    expect(result.current.tags.map((tag) => tag.label)).toEqual(['shared', 'first']);
    expect(toast).not.toHaveBeenCalled();
  });

  it('does not show a failed toggle toast after the owning view unmounts', async () => {
    const pending = Promise.withResolvers<void>();
    vi.mocked(TagController.commitDelete).mockReturnValueOnce(pending.promise);
    setupLiveQueryMock(
      { tags: [{ label: 'solo', taggers: ['mock-user-id'], taggers_count: 1, relationship: true }] },
      { unique_tags: 1 },
    );
    const { result, unmount } = renderHook(() => usePostTags('author:post123'));
    let toggle!: Promise<void>;
    act(() => {
      toggle = result.current.handleTagToggle({ label: 'solo', relationship: true });
    });
    unmount();
    await act(async () => {
      pending.reject(new Error('offline'));
      await toggle;
    });
    expect(toast).not.toHaveBeenCalled();
  });

  describe('initialization', () => {
    it('requests local-first initialization on mount', async () => {
      renderHook(() => usePostTags('author:post123'));

      await waitFor(() => {
        expect(mockGetOrFetchTags).toHaveBeenCalledWith({
          kind: 'post',
          id: 'author:post123',
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
      vi.mocked(useAuthStore).mockImplementation(mockAuthStoreSelector(null));
      vi.mocked(useLiveQuery).mockReturnValue(undefined);

      const { result } = renderHook(() => usePostTags('author:post123'));

      const response = await result.current.handleTagAdd('test-tag');

      expect(response.success).toBe(false);
      expect(response.error).toBe('You must be logged in to add tags');
    });

    it('does not show a success toast when a tag is added', async () => {
      const { result } = renderHook(() => usePostTags('author:post123'));

      let response: Awaited<ReturnType<typeof result.current.handleTagAdd>>;
      await act(async () => {
        response = await result.current.handleTagAdd('test-tag');
      });

      expect(response!).toEqual({ success: true });
      expect(vi.mocked(toast)).not.toHaveBeenCalled();
    });

    it('shows an error toast when adding a tag fails', async () => {
      vi.mocked(TagController.commitCreate).mockRejectedValueOnce(
        Err.network(NetworkErrorCode.CONNECTION_FAILED, 'Network error', {
          service: ErrorService.Nexus,
          operation: 'commitTag',
        }),
      );

      const { result } = renderHook(() => usePostTags('author:post123'));

      let response: Awaited<ReturnType<typeof result.current.handleTagAdd>>;
      await act(async () => {
        response = await result.current.handleTagAdd('broken-tag');
      });

      expect(response!).toEqual({ success: false, error: 'Failed to add tag' });
      expect(vi.mocked(toast)).toHaveBeenCalledWith({
        variant: 'error',
        description: 'Could not add tag',
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
      vi.mocked(useLiveQuery).mockReturnValue({ id: 'author:post123', tags: [tagWithOneCount] });

      const { result, rerender } = renderHook(() => usePostTags('author:post123'));

      // Verify initial state - tag should be present
      expect(result.current.tags).toHaveLength(1);
      expect(result.current.tags[0].label).toBe('solo-tag');
      expect(result.current.tags[0].taggers_count).toBe(1);

      // Toggle (remove) the tag
      await result.current.handleTagToggle({ label: 'solo-tag', relationship: true });

      // After delete, simulate IndexedDB returning empty (tag removed from DB)
      vi.mocked(useLiveQuery).mockReturnValue({ id: 'author:post123', tags: [] });
      rerender();

      // BUG: Currently the tag disappears.
      // EXPECTED: Tag should remain visible with taggers_count: 0
      expect(result.current.tags).toHaveLength(1);
      expect(result.current.tags[0].label).toBe('solo-tag');
      expect(result.current.tags[0].taggers_count).toBe(0);
      expect(result.current.tags[0].relationship).toBe(false);
    });

    it('does not show a success toast when a tag is removed', async () => {
      const mockViewerId = 'viewer-123';
      vi.mocked(useAuthStore).mockImplementation(mockAuthStoreSelector(mockViewerId));
      vi.mocked(useLiveQuery).mockReturnValue({
        id: 'author:post123',
        tags: [{ label: 'solo-tag', taggers_count: 1, taggers: [mockViewerId], relationship: true }],
      });

      const { result } = renderHook(() => usePostTags('author:post123'));

      await act(async () => {
        await result.current.handleTagToggle({ label: 'solo-tag', relationship: true });
      });

      expect(vi.mocked(toast)).not.toHaveBeenCalled();
    });

    it('shows an error toast when removing a tag fails', async () => {
      const mockViewerId = 'viewer-123';
      vi.mocked(useAuthStore).mockImplementation(mockAuthStoreSelector(mockViewerId));
      vi.mocked(useLiveQuery).mockReturnValue({
        id: 'author:post123',
        tags: [{ label: 'solo-tag', taggers_count: 1, taggers: [mockViewerId], relationship: true }],
      });
      vi.mocked(TagController.commitDelete).mockRejectedValueOnce(
        Err.network(NetworkErrorCode.CONNECTION_FAILED, 'Network error', {
          service: ErrorService.Nexus,
          operation: 'commitTag',
        }),
      );

      const { result } = renderHook(() => usePostTags('author:post123'));

      await act(async () => {
        await result.current.handleTagToggle({ label: 'solo-tag', relationship: true });
      });

      expect(vi.mocked(toast)).toHaveBeenCalledWith({
        variant: 'error',
        description: 'Could not remove tag',
      });
    });
  });

  describe('front-of-list promotion', () => {
    it('promotes a newly added tag (via handleTagAdd) to the front of the list', async () => {
      const mockViewerId = 'viewer-123';
      vi.mocked(useAuthStore).mockImplementation(mockAuthStoreSelector(mockViewerId));

      const existingTags = [
        { label: 'alpha', taggers_count: 5, taggers: ['other-1'], relationship: false },
        { label: 'beta', taggers_count: 4, taggers: ['other-2'], relationship: false },
        { label: 'gamma', taggers_count: 3, taggers: ['other-3'], relationship: false },
      ];

      let liveTags = [...existingTags];
      vi.mocked(useLiveQuery).mockImplementation((_queryFn, deps) => {
        if (deps?.length === 2) return { id: 'author:post123', tags: liveTags };
        return undefined;
      });

      const { result, rerender } = renderHook(() => usePostTags('author:post123'));

      await waitFor(() => {
        expect(result.current.tags).toHaveLength(3);
      });

      // Simulate the optimistic local-first write reaching useLiveQuery
      // (commitCreate appends the new tag in IndexedDB).
      await act(async () => {
        await result.current.handleTagAdd('zeta');
        liveTags = [...existingTags, { label: 'zeta', taggers_count: 1, taggers: [mockViewerId], relationship: true }];
        rerender();
      });

      await waitFor(() => {
        expect(result.current.tags).toHaveLength(4);
        expect(result.current.tags[0].label).toBe('zeta');
      });
    });

    it('puts the most recently added tag at the very front when several are added in a row', async () => {
      const mockViewerId = 'viewer-123';
      vi.mocked(useAuthStore).mockImplementation(mockAuthStoreSelector(mockViewerId));

      let liveTags: Array<{ label: string; taggers_count: number; taggers: string[]; relationship: boolean }> = [
        { label: 'alpha', taggers_count: 5, taggers: ['other-1'], relationship: false },
      ];
      vi.mocked(useLiveQuery).mockImplementation((_queryFn, deps) => {
        if (deps?.length === 2) return { id: 'author:post123', tags: liveTags };
        return undefined;
      });

      const { result, rerender } = renderHook(() => usePostTags('author:post123'));

      await act(async () => {
        await result.current.handleTagAdd('first');
        liveTags = [...liveTags, { label: 'first', taggers_count: 1, taggers: [mockViewerId], relationship: true }];
        rerender();
      });
      await act(async () => {
        await result.current.handleTagAdd('second');
        liveTags = [...liveTags, { label: 'second', taggers_count: 1, taggers: [mockViewerId], relationship: true }];
        rerender();
      });

      await waitFor(() => {
        expect(result.current.tags[0].label).toBe('second');
        expect(result.current.tags[1].label).toBe('first');
      });
    });

    it('does NOT promote a tag when added via handleTagToggle (clicking an existing chip)', async () => {
      const mockViewerId = 'viewer-123';
      vi.mocked(useAuthStore).mockImplementation(mockAuthStoreSelector(mockViewerId));

      const existingTags = [
        { label: 'alpha', taggers_count: 5, taggers: ['other-1'], relationship: false },
        { label: 'beta', taggers_count: 4, taggers: ['other-2'], relationship: false },
        { label: 'gamma', taggers_count: 3, taggers: ['other-3'], relationship: false },
      ];

      setupLiveQueryMock({ tags: existingTags }, undefined);

      const { result } = renderHook(() => usePostTags('author:post123'));

      await waitFor(() => {
        expect(result.current.tags).toHaveLength(3);
      });

      await act(async () => {
        await result.current.handleTagToggle({ label: 'beta', relationship: false });
      });

      // beta stays in its original position (index 1), not promoted to index 0.
      expect(result.current.tags[0].label).toBe('alpha');
      expect(result.current.tags[1].label).toBe('beta');
      expect(result.current.tags[2].label).toBe('gamma');
      expect(vi.mocked(toast)).not.toHaveBeenCalled();
    });

    it('clears the recently-added pin when the viewer removes the tag right after adding it', async () => {
      const mockViewerId = 'viewer-123';
      vi.mocked(useAuthStore).mockImplementation(mockAuthStoreSelector(mockViewerId));

      let liveTags: Array<{ label: string; taggers_count: number; taggers: string[]; relationship: boolean }> = [
        { label: 'alpha', taggers_count: 5, taggers: ['other-1'], relationship: false },
        { label: 'beta', taggers_count: 4, taggers: ['other-2'], relationship: false },
      ];
      vi.mocked(useLiveQuery).mockImplementation((_queryFn, deps) => {
        if (deps?.length === 2) return { id: 'author:post123', tags: liveTags };
        return undefined;
      });

      const { result, rerender } = renderHook(() => usePostTags('author:post123'));

      // Viewer adds "zeta" via input field → pinned to front.
      await act(async () => {
        await result.current.handleTagAdd('zeta');
        liveTags = [...liveTags, { label: 'zeta', taggers_count: 1, taggers: [mockViewerId], relationship: true }];
        rerender();
      });

      await waitFor(() => {
        expect(result.current.tags[0].label).toBe('zeta');
      });

      // Viewer immediately clicks "zeta" to remove their own tag — pin should clear.
      // (taggers_count becomes 0, so zero-tagger fallback keeps it visible in the list.)
      await act(async () => {
        await result.current.handleTagToggle({ label: 'zeta', relationship: true });
        liveTags = liveTags.filter((t) => t.label !== 'zeta');
        rerender();
      });

      await waitFor(() => {
        // zeta still shows because of the zero-tagger preservation (taggers_count
        // dropped to 0), but it must NOT be at the front anymore — falls back to
        // its natural index (last seen).
        const labels = result.current.tags.map((t) => t.label);
        expect(labels).toContain('zeta');
        expect(labels[0]).not.toBe('zeta');
      });
    });
  });
});
