import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useUserInfoPopoverData } from './useUserInfoPopoverData';

const mockUseCurrentUserProfile = vi.fn();
const mockUseUserProfile = vi.fn();
const mockUseProfileStats = vi.fn();
const mockUseIsFollowing = vi.fn();
const mockUseProfileConnections = vi.fn();

vi.mock('@/hooks', () => ({
  useCurrentUserProfile: () => mockUseCurrentUserProfile(),
  useUserProfile: () => mockUseUserProfile(),
  useProfileStats: () => mockUseProfileStats(),
  useIsFollowing: () => mockUseIsFollowing(),
  useProfileConnections: () => mockUseProfileConnections(),
  CONNECTION_TYPE: { FOLLOWERS: 'followers', FOLLOWING: 'following' },
}));

describe('useUserInfoPopoverData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseCurrentUserProfile.mockReturnValue({ currentUserPubky: 'me' });
    mockUseUserProfile.mockReturnValue({ profile: { bio: 'Bio', avatarUrl: 'avatar' }, isLoading: false });
    mockUseProfileStats.mockReturnValue({ stats: { followers: 10, following: 2 }, isLoading: false });
    mockUseIsFollowing.mockReturnValue({ isFollowing: false, isLoading: false });
    mockUseProfileConnections.mockImplementation((type: string) => {
      if (type === 'followers') return { connections: [{ id: 'a' }], count: 1, isLoading: false };
      return { connections: [{ id: 'b' }], count: 1, isLoading: false };
    });
  });

  it('returns combined data for a non-current user', () => {
    const { result } = renderHook(() => useUserInfoPopoverData('other'));
    expect(result.current.isCurrentUser).toBe(false);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.profileBio).toBe('Bio');
    expect(result.current.profileAvatarUrl).toBe('avatar');
    expect(result.current.followersCount).toBe(1);
    expect(result.current.followingCount).toBe(1);
    expect(result.current.statsFollowers).toBe(10);
    expect(result.current.statsFollowing).toBe(2);
  });

  it('detects current user correctly', () => {
    const { result } = renderHook(() => useUserInfoPopoverData('me'));
    expect(result.current.isCurrentUser).toBe(true);
  });

  it('returns isLoading true when profile is loading', () => {
    mockUseUserProfile.mockReturnValue({ profile: null, isLoading: true });
    const { result } = renderHook(() => useUserInfoPopoverData('other'));
    expect(result.current.isLoading).toBe(true);
  });

  it('returns isLoading true when stats is loading', () => {
    mockUseProfileStats.mockReturnValue({ stats: { followers: 0, following: 0 }, isLoading: true });
    const { result } = renderHook(() => useUserInfoPopoverData('other'));
    expect(result.current.isLoading).toBe(true);
  });
});
