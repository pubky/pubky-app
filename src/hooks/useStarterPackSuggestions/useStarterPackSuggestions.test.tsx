import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { STARTER_PACK_SUGGESTIONS_LIMIT } from '@/config/nexus';
import { useUserStream } from '@/hooks/useUserStream/useUserStream';
import type { UserStreamUser } from '@/hooks/useUserStream/useUserStream.types';
import { UserStreamTypes } from '@/models/stream/user/userStream.types';
import { useOnboardingStore } from '@/stores/onboarding/onboarding.store';
import { useStarterPackSuggestions } from './useStarterPackSuggestions';

const mockToggleFollow = vi.fn();
vi.mock('@/hooks/useFollowUser/useFollowUser', () => ({
  useFollowUser: () => ({
    toggleFollow: mockToggleFollow,
    isUserLoading: () => false,
  }),
}));

vi.mock('@/hooks/useUserStream/useUserStream', () => ({
  useUserStream: vi.fn(),
}));

function makeUser(id: string, overrides: Partial<UserStreamUser> = {}): UserStreamUser {
  return {
    id,
    name: `User ${id}`,
    bio: '',
    image: null,
    avatarUrl: null,
    status: null,
    counts: { posts: 1, tags: 2, followers: 3, following: 4 },
    isFollowing: false,
    tags: [],
    ...overrides,
  };
}

function mockStream(users: UserStreamUser[], overrides: Partial<ReturnType<typeof useUserStream>> = {}) {
  vi.mocked(useUserStream).mockReturnValue({
    users,
    userIds: users.map((u) => u.id),
    isLoading: false,
    isLoadingMore: false,
    hasMore: false,
    error: null,
    loadMore: vi.fn(),
    refetch: vi.fn(),
    ...overrides,
  });
}

describe('useStarterPackSuggestions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockToggleFollow.mockResolvedValue(true);
    useOnboardingStore.setState({ hasHydrated: true, interestTags: [] });
    mockStream([]);
  });

  it('requests the starter pack stream built from the ordered interest tags', () => {
    useOnboardingStore.setState({ interestTags: ['travel', 'music'] });

    renderHook(() => useStarterPackSuggestions());

    expect(vi.mocked(useUserStream)).toHaveBeenCalledWith(
      expect.objectContaining({
        streamId: 'starter_pack:all:all:travel,music',
        limit: STARTER_PACK_SUGGESTIONS_LIMIT,
        bufferSize: STARTER_PACK_SUGGESTIONS_LIMIT,
        refillThreshold: STARTER_PACK_SUGGESTIONS_LIMIT,
        includeCounts: true,
        includeRelationships: true,
        includeTags: true,
        excludeFollowing: true,
        preserveFollowedUserIds: [],
      }),
    );
    expect(vi.mocked(useUserStream).mock.calls[0][0]).not.toHaveProperty('paginated');
  });

  it('falls back to most active users this month with no interests', () => {
    renderHook(() => useStarterPackSuggestions());

    expect(vi.mocked(useUserStream)).toHaveBeenCalledWith(
      expect.objectContaining({ streamId: UserStreamTypes.THIS_MONTH_INFLUENCERS_ALL }),
    );
  });

  it('attaches capped matching tags and splits followed from unfollowed suggestions', () => {
    useOnboardingStore.setState({ interestTags: ['bitcoin', 'music', 'travel'] });
    mockStream([
      makeUser('a', { tags: ['developer', 'bitcoin', 'music', 'travel'] }),
      makeUser('b', { tags: ['founder'], isFollowing: true }),
      makeUser('c'),
    ]);

    const { result } = renderHook(() => useStarterPackSuggestions());

    expect(result.current.users.map((u) => u.matchingTags)).toEqual([['bitcoin', 'music'], [], []]);
    expect(result.current.unfollowedUsers.map((u) => u.id)).toEqual(['a', 'c']);
    expect(result.current.followedCount).toBe(1);
  });

  it('passes preserved followed ids back into the stream so followed cards stay listed', async () => {
    mockStream([makeUser('a')]);
    const { result } = renderHook(() => useStarterPackSuggestions());

    await act(async () => {
      await result.current.handleFollowClick('a', false, 'User a');
    });

    expect(mockToggleFollow).toHaveBeenCalledWith('a', false, 'User a');
    expect(vi.mocked(useUserStream)).toHaveBeenLastCalledWith(
      expect.objectContaining({ preserveFollowedUserIds: ['a'] }),
    );

    act(() => {
      result.current.preserveFollowedUser('b');
    });

    expect(vi.mocked(useUserStream)).toHaveBeenLastCalledWith(
      expect.objectContaining({ preserveFollowedUserIds: ['a', 'b'] }),
    );
  });

  it('surfaces whether a per-card follow is still committing', async () => {
    let resolveFollow!: (ok: boolean) => void;
    mockToggleFollow.mockReturnValue(
      new Promise<boolean>((res) => {
        resolveFollow = res;
      }),
    );
    mockStream([makeUser('a')]);
    const { result } = renderHook(() => useStarterPackSuggestions());
    expect(result.current.isFollowPending).toBe(false);

    act(() => {
      void result.current.handleFollowClick('a', false, 'User a');
    });
    expect(result.current.isFollowPending).toBe(true);

    await act(async () => {
      resolveFollow(true);
    });
    expect(result.current.isFollowPending).toBe(false);
  });

  it('surfaces loading and error state from the stream', () => {
    mockStream([], { isLoading: true, error: 'boom' });

    const { result } = renderHook(() => useStarterPackSuggestions());

    expect(result.current.isLoading).toBe(true);
    expect(result.current.error).toBe('boom');
  });
});
