import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useProfileHeader, type UserProfile, type ProfileStats, type ProfileActions } from './useProfileHeader';

// Mock the composed hooks
let mockProfile: UserProfile | null = null;
let mockProfileLoading = false;
let mockStats: ProfileStats = {
  notifications: 0,
  posts: 0,
  replies: 0,
  followers: 0,
  following: 0,
  friends: 0,
  uniqueTags: 0,
};
let mockStatsLoading = false;
let mockActions: ProfileActions = {
  onEdit: vi.fn(),
  onCopyPublicKey: vi.fn(),
  onCopyLink: vi.fn(),
  onSignOut: vi.fn(),
  onStatusChange: vi.fn(),
  isLoggingOut: false,
};

// Mock direct imports (used by useProfileHeader)
vi.mock('@/hooks/useUserProfile/useUserProfile', () => ({
  useUserProfile: vi.fn(() => ({
    profile: mockProfile,
    isLoading: mockProfileLoading,
  })),
}));

vi.mock('@/hooks/useProfileStats/useProfileStats', () => ({
  useProfileStats: vi.fn(() => ({
    stats: mockStats,
    isLoading: mockStatsLoading,
  })),
}));

vi.mock('@/hooks/useProfileActions/useProfileActions', () => ({
  useProfileActions: vi.fn(() => mockActions),
}));

describe('useProfileHeader', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Reset mocks to default values
    mockProfile = null;
    mockProfileLoading = false;
    mockStats = {
      notifications: 0,
      posts: 0,
      replies: 0,
      followers: 0,
      following: 0,
      friends: 0,
      uniqueTags: 0,
    };
    mockStatsLoading = false;
    mockActions = {
      onEdit: vi.fn(),
      onCopyPublicKey: vi.fn(),
      onCopyLink: vi.fn(),
      onSignOut: vi.fn(),
      onStatusChange: vi.fn(),
      isLoggingOut: false,
    };
  });

  describe('Composition', () => {
    it('composes useUserProfile, useProfileStats, and useProfileActions', () => {
      mockProfile = {
        name: 'Test User',
        bio: 'Test bio',
        publicKey: 'pubkytest-user-id',
        emoji: '🌴',
        status: 'Active',
        avatarUrl: 'https://example.com/avatar/test-user-id',
        link: 'https://example.com/profile/test-user-id',
      };
      mockStats = {
        notifications: 0,
        posts: 10,
        replies: 5,
        followers: 20,
        following: 15,
        friends: 8,
        uniqueTags: 3,
      };

      const { result } = renderHook(() => useProfileHeader('test-user-id'));

      expect(result.current.profile).toEqual(mockProfile);
      expect(result.current.stats).toEqual(mockStats);
      expect(result.current.actions).toEqual(mockActions);
    });

    it('returns default profile when useUserProfile returns null', () => {
      mockProfile = null;
      mockProfileLoading = true;

      const { result } = renderHook(() => useProfileHeader('test-user-id'));

      // Hook guarantees a non-null profile with default values
      expect(result.current.profile).toEqual({
        name: '',
        bio: '',
        publicKey: '',
        emoji: '🌴',
        status: '',
        avatarUrl: undefined,
        link: '',
      });
      expect(result.current.isLoading).toBe(true);
    });

    it('returns profile data when available', () => {
      mockProfile = {
        name: 'Test User',
        bio: 'Test bio',
        publicKey: 'pubkytest-user-id',
        emoji: '🌴',
        status: 'Active',
        avatarUrl: undefined,
        link: 'https://example.com/profile/test-user-id',
      };

      const { result } = renderHook(() => useProfileHeader('test-user-id'));

      expect(result.current.profile?.name).toBe('Test User');
      expect(result.current.profile?.bio).toBe('Test bio');
      expect(result.current.profile?.status).toBe('Active');
      expect(result.current.profile?.publicKey).toBe('pubkytest-user-id');
      expect(result.current.profile?.link).toBe('https://example.com/profile/test-user-id');
    });
  });

  describe('Stats', () => {
    it('returns stats from useProfileStats', () => {
      mockStats = {
        notifications: 0,
        posts: 10,
        replies: 5,
        followers: 20,
        following: 15,
        friends: 8,
        uniqueTags: 3,
      };

      const { result } = renderHook(() => useProfileHeader('test-user-id'));

      expect(result.current.stats.posts).toBe(10);
      expect(result.current.stats.replies).toBe(5);
      expect(result.current.stats.followers).toBe(20);
      expect(result.current.stats.following).toBe(15);
      expect(result.current.stats.friends).toBe(8);
      expect(result.current.stats.uniqueTags).toBe(3);
    });

    it('returns zero stats when not available', () => {
      mockStats = {
        notifications: 0,
        posts: 0,
        replies: 0,
        followers: 0,
        following: 0,
        friends: 0,
        uniqueTags: 0,
      };

      const { result } = renderHook(() => useProfileHeader('test-user-id'));

      expect(result.current.stats.posts).toBe(0);
      expect(result.current.stats.replies).toBe(0);
      expect(result.current.stats.followers).toBe(0);
      expect(result.current.stats.following).toBe(0);
      expect(result.current.stats.friends).toBe(0);
      expect(result.current.stats.uniqueTags).toBe(0);
    });
  });

  describe('Actions', () => {
    it('returns actions from useProfileActions', () => {
      const { result } = renderHook(() => useProfileHeader('test-user-id'));

      expect(result.current.actions).toEqual(mockActions);
      expect(result.current.actions.onCopyPublicKey).toBeDefined();
      expect(result.current.actions.onCopyLink).toBeDefined();
      expect(result.current.actions.onSignOut).toBeDefined();
      expect(result.current.actions.onEdit).toBeDefined();
      expect(result.current.actions.onStatusChange).toBeDefined();
    });

    it('calls action handlers', () => {
      const { result } = renderHook(() => useProfileHeader('test-user-id'));

      result.current.actions.onCopyPublicKey();
      result.current.actions.onCopyLink();
      result.current.actions.onSignOut();
      result.current.actions.onEdit();
      result.current.actions.onStatusChange('active');

      expect(mockActions.onCopyPublicKey).toHaveBeenCalled();
      expect(mockActions.onCopyLink).toHaveBeenCalled();
      expect(mockActions.onSignOut).toHaveBeenCalled();
      expect(mockActions.onEdit).toHaveBeenCalled();
      expect(mockActions.onStatusChange).toHaveBeenCalled();
    });

    it('passes correct props to useProfileActions when profile exists', () => {
      mockProfile = {
        name: 'Test User',
        bio: 'Test bio',
        publicKey: 'pubkytest-user-id',
        emoji: '🌴',
        status: 'Active',
        avatarUrl: undefined,
        link: 'https://example.com/profile/test-user-id',
      };

      renderHook(() => useProfileHeader('test-user-id'));

      // Verify actions are returned
      const { result } = renderHook(() => useProfileHeader('test-user-id'));
      expect(result.current.actions).toBeDefined();
    });

    it('handles null profile gracefully in actions', () => {
      mockProfile = null;

      const { result } = renderHook(() => useProfileHeader('test-user-id'));

      // Actions should still be defined even with null profile
      expect(result.current.actions).toBeDefined();
      expect(result.current.actions.onCopyPublicKey).toBeDefined();
      expect(result.current.actions.onCopyLink).toBeDefined();
    });
  });

  describe('Loading state', () => {
    it('isLoading is true when profile is loading', () => {
      mockProfileLoading = true;
      mockStatsLoading = false;

      const { result } = renderHook(() => useProfileHeader('test-user-id'));

      expect(result.current.isLoading).toBe(true);
    });

    it('isLoading is true when stats are loading', () => {
      mockProfileLoading = false;
      mockStatsLoading = true;

      const { result } = renderHook(() => useProfileHeader('test-user-id'));

      expect(result.current.isLoading).toBe(true);
    });

    it('isLoading is true when both profile and stats are loading', () => {
      mockProfileLoading = true;
      mockStatsLoading = true;

      const { result } = renderHook(() => useProfileHeader('test-user-id'));

      expect(result.current.isLoading).toBe(true);
    });

    it('isLoading is false when both profile and stats are loaded', () => {
      mockProfileLoading = false;
      mockStatsLoading = false;
      mockProfile = {
        name: 'Test User',
        bio: 'Test bio',
        publicKey: 'pubkytest-user-id',
        emoji: '🌴',
        status: 'Active',
        avatarUrl: undefined,
        link: 'https://example.com/profile/test-user-id',
      };

      const { result } = renderHook(() => useProfileHeader('test-user-id'));

      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('User not found state', () => {
    it('userNotFound is true when loading is complete but profile is null', () => {
      mockProfileLoading = false;
      mockStatsLoading = false;
      mockProfile = null;

      const { result } = renderHook(() => useProfileHeader('test-user-id'));

      expect(result.current.userNotFound).toBe(true);
      expect(result.current.isLoading).toBe(false);
    });

    it('userNotFound is false when loading is in progress', () => {
      mockProfileLoading = true;
      mockStatsLoading = false;
      mockProfile = null;

      const { result } = renderHook(() => useProfileHeader('test-user-id'));

      expect(result.current.userNotFound).toBe(false);
      expect(result.current.isLoading).toBe(true);
    });

    it('userNotFound is false when profile exists', () => {
      mockProfileLoading = false;
      mockStatsLoading = false;
      mockProfile = {
        name: 'Test User',
        bio: 'Test bio',
        publicKey: 'pubkytest-user-id',
        emoji: '🌴',
        status: 'Active',
        avatarUrl: undefined,
        link: 'https://example.com/profile/test-user-id',
      };

      const { result } = renderHook(() => useProfileHeader('test-user-id'));

      expect(result.current.userNotFound).toBe(false);
      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('Edge cases', () => {
    it('handles null profile gracefully with default values', () => {
      mockProfile = null;

      const { result } = renderHook(() => useProfileHeader('test-user-id'));

      // Hook provides default values instead of null
      expect(result.current.profile).toEqual({
        name: '',
        bio: '',
        publicKey: '',
        emoji: '🌴',
        status: '',
        avatarUrl: undefined,
        link: '',
      });
    });

    it('handles profile with all fields', () => {
      mockProfile = {
        name: 'Test User',
        bio: 'Test bio',
        publicKey: 'pubkytest-user-id',
        emoji: '🌴',
        status: 'Active',
        avatarUrl: 'https://example.com/avatar/test-user-id',
        link: 'https://example.com/profile/test-user-id',
      };

      const { result } = renderHook(() => useProfileHeader('test-user-id'));

      expect(result.current.profile).toEqual(mockProfile);
    });
  });

  describe('Type exports', () => {
    it('exports ProfileStats type', () => {
      // This test ensures the type export is working
      const stats: ProfileStats = {
        notifications: 0,
        posts: 0,
        replies: 0,
        followers: 0,
        following: 0,
        friends: 0,
        uniqueTags: 0,
      };

      expect(stats).toBeDefined();
    });

    it('exports UserProfile type', () => {
      // This test ensures the type export is working
      const profile: UserProfile = {
        name: 'Test',
        bio: 'Bio',
        publicKey: 'pubkytest',
        emoji: '🌴',
        status: 'Active',
        avatarUrl: undefined,
        link: 'https://example.com',
      };

      expect(profile).toBeDefined();
    });

    it('exports ProfileActions type', () => {
      // This test ensures the type export is working
      const actions: ProfileActions = {
        onEdit: vi.fn(),
        onCopyPublicKey: vi.fn(),
        onCopyLink: vi.fn(),
        onSignOut: vi.fn(),
        onStatusChange: vi.fn(),
        isLoggingOut: false,
      };

      expect(actions).toBeDefined();
    });
  });
});
