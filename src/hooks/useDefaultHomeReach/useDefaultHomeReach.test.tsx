import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useProfileStats } from '@/hooks/useProfileStats/useProfileStats';
import { useHomeStore } from '@/stores/home/home.store';
import { homeInitialState, REACH } from '@/stores/home/home.types';
import { useDefaultHomeReach } from './useDefaultHomeReach';

let mockCurrentUserPubky: string | null = 'viewer-pubky';
let mockAuthHasHydrated = true;
let mockFollowing = 0;
let mockIsLoading = false;

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (state: { currentUserPubky: string | null; hasHydrated: boolean }) => unknown) =>
    selector({ currentUserPubky: mockCurrentUserPubky, hasHydrated: mockAuthHasHydrated }),
}));

vi.mock('@/hooks/useProfileStats/useProfileStats', () => ({
  useProfileStats: vi.fn(() => ({
    stats: {
      notifications: 0,
      posts: 0,
      replies: 0,
      collections: 0,
      followers: 0,
      following: mockFollowing,
      friends: 0,
      uniqueTags: 0,
    },
    isLoading: mockIsLoading,
  })),
}));

describe('useDefaultHomeReach', () => {
  beforeEach(() => {
    mockCurrentUserPubky = 'viewer-pubky';
    mockAuthHasHydrated = true;
    mockFollowing = 0;
    mockIsLoading = false;
    useHomeStore.setState({ ...homeInitialState, hasHydrated: true });
    vi.mocked(useProfileStats).mockClear();
  });

  it('switches a fresh eligible user to My network', () => {
    mockFollowing = 3;

    renderHook(() => useDefaultHomeReach());

    expect(useHomeStore.getState().reach).toBe(REACH.NETWORK);
    expect(useHomeStore.getState().hasUserSetReach).toBe(false);
  });

  it('stays on All when the user follows fewer than three accounts', () => {
    mockFollowing = 2;

    renderHook(() => useDefaultHomeReach());

    expect(useHomeStore.getState().reach).toBe(REACH.ALL);
  });

  it('stays on All when the count query resolves without eligible data', () => {
    mockFollowing = 0;

    renderHook(() => useDefaultHomeReach());

    expect(useHomeStore.getState().reach).toBe(REACH.ALL);
  });

  it('does not load counts or apply a default before both stores hydrate', () => {
    mockFollowing = 10;
    mockAuthHasHydrated = false;
    useHomeStore.setState({ hasHydrated: false });

    renderHook(() => useDefaultHomeReach());

    expect(useProfileStats).toHaveBeenCalledWith('viewer-pubky', { enabled: false });
    expect(useHomeStore.getState().reach).toBe(REACH.ALL);
  });

  it('does not apply the default while counts are loading', () => {
    mockFollowing = 10;
    mockIsLoading = true;

    renderHook(() => useDefaultHomeReach());

    expect(useHomeStore.getState().reach).toBe(REACH.ALL);
  });

  it('keeps a persisted reach choice', () => {
    useHomeStore.setState({ reach: REACH.FRIENDS, hasUserSetReach: true });
    mockFollowing = 10;

    renderHook(() => useDefaultHomeReach());

    expect(useHomeStore.getState().reach).toBe(REACH.FRIENDS);
    expect(useProfileStats).toHaveBeenCalledWith('viewer-pubky', { enabled: false });
  });

  it('lets a user choice win when counts resolve later', () => {
    mockIsLoading = true;
    mockFollowing = 10;
    const { rerender } = renderHook(() => useDefaultHomeReach());

    act(() => {
      useHomeStore.getState().setReach(REACH.ME);
      mockIsLoading = false;
    });
    rerender();

    expect(useHomeStore.getState().reach).toBe(REACH.ME);
    expect(useHomeStore.getState().hasUserSetReach).toBe(true);
  });

  it('does not apply the default for a signed-out user', () => {
    mockCurrentUserPubky = null;
    mockFollowing = 10;

    renderHook(() => useDefaultHomeReach());

    expect(useProfileStats).toHaveBeenCalledWith('', { enabled: false });
    expect(useHomeStore.getState().reach).toBe(REACH.ALL);
  });
});
