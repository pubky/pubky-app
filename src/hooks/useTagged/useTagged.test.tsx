import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TagKind } from '@/application/tag/tag.types';
import { useProfileStats } from '@/hooks/useProfileStats/useProfileStats';
import type { SessionRestoreStatus } from '@/libs/auth/session.types';
import { AuthErrorCode, NetworkErrorCode } from '@/libs/error/error.codes';
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
  const authState = {
    currentUserPubky: 'mock-current-user',
    selectCurrentUserPubky: () => 'mock-current-user',
    restoreStatus: 'ready' as SessionRestoreStatus,
  };
  return {
    mockGetOrFetchTags,
    mockTagCreate,
    mockTagDelete,
    authState,
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
vi.mock('@/stores/auth/auth.store', async () => {
  const { createZustandLikeHook } = await import('@/test-utils/stores');
  return { useAuthStore: createZustandLikeHook(mockMocks.authState) };
});

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
    mockMocks.authState.restoreStatus = 'ready';
    mockUseProfileStats.mockReturnValue(defaultProfileStats);
    mockMocks.mockGetOrFetchTags.mockResolvedValue(undefined);
    mockMocks.mockTagCreate.mockResolvedValue(undefined);
    mockMocks.mockTagDelete.mockResolvedValue(undefined);
  });

  it.each([false, true])('ignores an old add completion after revisiting the profile (failed=%s)', async (failed) => {
    const pending = Promise.withResolvers<void>();
    mockMocks.mockTagCreate.mockReturnValueOnce(pending.promise);
    const { result, rerender } = renderHook((id: string) => useTagged(id), { initialProps: mockUserId });
    let action!: ReturnType<typeof result.current.handleTagAdd>;
    act(() => {
      action = result.current.handleTagAdd('bitcoin');
    });
    await waitFor(() => expect(mockMocks.mockTagCreate).toHaveBeenCalled());
    rerender('another-profile');
    rerender(mockUserId);

    await act(async () => {
      if (failed)
        pending.reject(
          Err.network(NetworkErrorCode.CONNECTION_FAILED, 'Unavailable', {
            service: ErrorService.Nexus,
            operation: 'createTag',
          }),
        );
      else pending.resolve();
      expect(await action).toEqual({ success: false });
    });
    expect(toast).not.toHaveBeenCalled();
  });

  it('does not remove a new profile placeholder when an old removal rolls back', async () => {
    const pending = Promise.withResolvers<void>();
    const tag = { label: 'bitcoin', taggers: ['mock-current-user'], taggers_count: 1, relationship: true };
    mockLocalTags = [tag];
    mockMocks.mockTagDelete.mockReturnValueOnce(pending.promise);
    const { result, rerender } = renderHook((id: string) => useTagged(id), { initialProps: mockUserId });
    let previous!: Promise<void>;
    act(() => {
      previous = result.current.handleTagToggle(tag);
    });
    await waitFor(() => expect(mockMocks.mockTagDelete).toHaveBeenCalled());
    rerender('another-profile');
    await act(() => result.current.handleTagToggle(tag));
    mockLocalTags = [];
    rerender('another-profile');
    expect(result.current.tags).toEqual([expect.objectContaining({ label: 'bitcoin', taggers_count: 0 })]);
    vi.mocked(toast).mockClear();

    await act(async () => {
      pending.reject(
        Err.network(NetworkErrorCode.CONNECTION_FAILED, 'Unavailable', {
          service: ErrorService.Nexus,
          operation: 'deleteTag',
        }),
      );
      await previous;
    });
    expect(result.current.tags).toEqual([expect.objectContaining({ label: 'bitcoin', taggers_count: 0 })]);
    expect(toast).not.toHaveBeenCalled();
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
    expect(vi.mocked(toast)).not.toHaveBeenCalled();
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

  it('prompts sign-in instead of the generic copy when the add is rejected as unauthenticated (#2890)', async () => {
    mockLocalTags = [];
    mockMocks.mockTagCreate.mockRejectedValueOnce(
      Err.auth(AuthErrorCode.SESSION_EXPIRED, 'Session expired', {
        service: ErrorService.Homeserver,
        operation: 'commitCreate',
      }),
    );

    const { result } = renderHook(() => useTagged(mockUserId));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    let addResult: Awaited<ReturnType<typeof result.current.handleTagAdd>>;
    await act(async () => {
      addResult = await result.current.handleTagAdd('unauthed');
    });

    expect(addResult!).toEqual({ success: false, error: 'Failed to add tag' });
    expect(vi.mocked(toast)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(toast)).toHaveBeenCalledWith({
      variant: 'error',
      description: 'Session expired. Please sign in.',
    });
  });

  it('still prompts sign-in when the rejected add settles after the view unmounted (#2957)', async () => {
    mockLocalTags = [];
    const pending = Promise.withResolvers<void>();
    mockMocks.mockTagCreate.mockReturnValueOnce(pending.promise);

    const { result, unmount } = renderHook(() => useTagged(mockUserId));
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    let add!: ReturnType<typeof result.current.handleTagAdd>;
    act(() => {
      add = result.current.handleTagAdd('unauthed');
    });
    await waitFor(() => expect(mockMocks.mockTagCreate).toHaveBeenCalled());
    // The 401 ends the session; the route guard redirects a guarded profile route to the landing page.
    mockMocks.authState.restoreStatus = 'reauth-required';
    unmount();
    let addResult: Awaited<typeof add>;
    await act(async () => {
      pending.reject(
        Err.auth(AuthErrorCode.SESSION_EXPIRED, 'Session expired', {
          service: ErrorService.Homeserver,
          operation: 'commitCreate',
        }),
      );
      addResult = await add;
    });

    expect(addResult!).toEqual({ success: false });
    expect(vi.mocked(toast)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(toast)).toHaveBeenCalledWith({
      variant: 'error',
      description: 'Session expired. Please sign in.',
    });
  });

  it('stays silent when any other add failure settles after the view unmounted', async () => {
    mockLocalTags = [];
    const pending = Promise.withResolvers<void>();
    mockMocks.mockTagCreate.mockReturnValueOnce(pending.promise);

    const { result, unmount } = renderHook(() => useTagged(mockUserId));
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    let add!: ReturnType<typeof result.current.handleTagAdd>;
    act(() => {
      add = result.current.handleTagAdd('offline');
    });
    await waitFor(() => expect(mockMocks.mockTagCreate).toHaveBeenCalled());
    // Even once another write's 401 ended the session, a generic failure of a closed view stays silent.
    mockMocks.authState.restoreStatus = 'reauth-required';
    unmount();
    let addResult: Awaited<typeof add>;
    await act(async () => {
      pending.reject(
        Err.network(NetworkErrorCode.CONNECTION_FAILED, 'Network error', {
          service: ErrorService.Homeserver,
          operation: 'commitCreate',
        }),
      );
      addResult = await add;
    });

    expect(addResult!).toEqual({ success: false });
    expect(vi.mocked(toast)).not.toHaveBeenCalled();
  });

  it("stays silent when a write ended by the user's own logout settles after the view unmounted (#2957)", async () => {
    mockLocalTags = [];
    const pending = Promise.withResolvers<void>();
    mockMocks.mockTagCreate.mockReturnValueOnce(pending.promise);

    const { result, unmount } = renderHook(() => useTagged(mockUserId));
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    let add!: ReturnType<typeof result.current.handleTagAdd>;
    act(() => {
      add = result.current.handleTagAdd('logout');
    });
    await waitFor(() => expect(mockMocks.mockTagCreate).toHaveBeenCalled());
    // Logout resets the store (no reauth needed) and the queued write throws SESSION_EXPIRED.
    mockMocks.authState.restoreStatus = 'idle';
    unmount();
    await act(async () => {
      pending.reject(
        Err.auth(AuthErrorCode.SESSION_EXPIRED, 'Session ended before the homeserver write completed.', {
          service: ErrorService.Homeserver,
          operation: 'queuedWrite',
        }),
      );
      await add;
    });

    expect(vi.mocked(toast)).not.toHaveBeenCalled();
  });

  it('does not show a success toast when removing a tag', async () => {
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
    expect(vi.mocked(toast)).not.toHaveBeenCalled();
  });

  it('does not show a success toast when adding a tag via an existing chip', async () => {
    mockLocalTags = [
      {
        label: 'bitcoin',
        taggers: ['other-user'],
        taggers_count: 1,
        relationship: false,
      },
    ];

    const { result } = renderHook(() => useTagged(mockUserId));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.handleTagToggle({ label: 'bitcoin', relationship: false });
    });

    expect(mockMocks.mockTagCreate).toHaveBeenCalledWith({
      taggedId: mockUserId,
      label: 'bitcoin',
      taggerId: 'mock-current-user',
      taggedKind: TagKind.USER,
    });
    expect(vi.mocked(toast)).not.toHaveBeenCalled();
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

  it('prompts sign-in when removing a tag is rejected as UNAUTHORIZED (#2890)', async () => {
    mockLocalTags = [
      {
        label: 'bitcoin',
        taggers: ['mock-current-user'],
        taggers_count: 1,
        relationship: true,
      },
    ];
    mockMocks.mockTagDelete.mockRejectedValueOnce(
      Err.auth(AuthErrorCode.UNAUTHORIZED, 'Unauthorized', {
        service: ErrorService.Homeserver,
        operation: 'commitDelete',
      }),
    );

    const { result } = renderHook(() => useTagged(mockUserId));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.handleTagToggle({ label: 'bitcoin', relationship: true });
    });

    expect(vi.mocked(toast)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(toast)).toHaveBeenCalledWith({
      variant: 'error',
      description: 'Session expired. Please sign in.',
    });
  });

  it('still prompts sign-in when a rejected toggle settles after the view unmounted (#2957)', async () => {
    mockLocalTags = [{ label: 'bitcoin', taggers: ['mock-current-user'], taggers_count: 1, relationship: true }];
    const pending = Promise.withResolvers<void>();
    mockMocks.mockTagDelete.mockReturnValueOnce(pending.promise);

    const { result, unmount } = renderHook(() => useTagged(mockUserId));
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    let toggle!: Promise<void>;
    act(() => {
      toggle = result.current.handleTagToggle({ label: 'bitcoin', relationship: true });
    });
    await waitFor(() => expect(mockMocks.mockTagDelete).toHaveBeenCalled());
    mockMocks.authState.restoreStatus = 'reauth-required';
    unmount();
    await act(async () => {
      pending.reject(
        Err.auth(AuthErrorCode.UNAUTHORIZED, 'Unauthorized', {
          service: ErrorService.Homeserver,
          operation: 'commitDelete',
        }),
      );
      await toggle;
    });

    expect(vi.mocked(toast)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(toast)).toHaveBeenCalledWith({
      variant: 'error',
      description: 'Session expired. Please sign in.',
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

// These tests exercise the mutation after auth readiness; restore races use the real store in auth-wait tests.
vi.mock('@/hooks/useRequireAuth/useRequireAuth', () => ({
  useRequireAuth: () => ({ waitForAuth: async () => true }),
}));
