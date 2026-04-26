import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useProfileMenuActions } from './useProfileMenuActions';
import { PROFILE_MENU_ACTION_IDS } from './useProfileMenuActions.constants';
import { isAppError } from '@/libs/error/error.utils';

// Hoist mocks
const {
  mockIsAppError,
  mockUseUserProfile,
  mockUseIsFollowing,
  mockUseFollowUser,
  mockUseMuteUser,
  mockUseMutedUsers,
  mockUseCopyToClipboard,
  mockToast,
  mockUseTranslations,
} = vi.hoisted(() => ({
  mockIsAppError: vi.fn(),
  mockUseUserProfile: vi.fn(),
  mockUseIsFollowing: vi.fn(),
  mockUseFollowUser: vi.fn(),
  mockUseMuteUser: vi.fn(),
  mockUseMutedUsers: vi.fn(),
  mockUseCopyToClipboard: vi.fn(),
  mockToast: vi.fn(),
  mockUseTranslations: vi.fn(),
}));

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => mockUseTranslations(namespace),
}));

// Mock Hooks
vi.mock('@/hooks', () => ({
  useUserProfile: (userId: string) => mockUseUserProfile(userId),
  useIsFollowing: (userId: string) => mockUseIsFollowing(userId),
  useFollowUser: () => mockUseFollowUser(),
  useMuteUser: () => mockUseMuteUser(),
  useMutedUsers: () => mockUseMutedUsers(),
  useCopyToClipboard: (options: unknown) => mockUseCopyToClipboard(options),
}));

// Mock Molecules
vi.mock('@/molecules', () => ({
  toast: (props: unknown) => mockToast(props),
}));

vi.mock('lucide-react', async () => {
  const actual = await vi.importActual<typeof import('lucide-react')>('lucide-react');
  return {
    ...actual,
    UserRoundPlus: vi.fn(() => <span>UserRoundPlus</span>),
    UserRoundMinus: vi.fn(() => <span>UserRoundMinus</span>),
    Key: vi.fn(() => <span>Key</span>),
    Link: vi.fn(() => <span>Link</span>),
    Megaphone: vi.fn(() => <span>Megaphone</span>),
    MegaphoneOff: vi.fn(() => <span>MegaphoneOff</span>),
  };
});
vi.mock('@/libs/error/error.utils', async () => {
  const actual = await vi.importActual<typeof import('@/libs/error/error.utils')>('@/libs/error/error.utils');
  return {
    ...actual,
    isAppError: mockIsAppError,
  };
});

// Mock window.location
Object.defineProperty(window, 'location', {
  value: {
    origin: 'https://example.com',
  },
  writable: true,
});

describe('useProfileMenuActions', () => {
  const mockUserId = 'user123';

  const defaultMocks = {
    profile: { name: 'Test User' },
    isFollowing: false,
    toggleFollow: vi.fn().mockResolvedValue(undefined),
    isFollowLoading: false,
    isUserLoading: vi.fn().mockReturnValue(false),
    toggleMute: vi.fn().mockResolvedValue(undefined),
    isMuteLoading: false,
    isMuteUserLoading: vi.fn().mockReturnValue(false),
    isMuted: vi.fn().mockReturnValue(false),
    copyToClipboard: vi.fn().mockResolvedValue(true),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockIsAppError.mockReturnValue(false);
    defaultMocks.isMuted.mockReturnValue(false);

    // Mock translations
    mockUseTranslations.mockImplementation((namespace: string) => {
      const translations: Record<string, Record<string, string>> = {
        'profile.actions': {
          followUser: 'Follow {username}',
          unfollowUser: 'Unfollow {username}',
          copyPubky: 'Copy user pubky',
          copyLink: 'Copy profile link',
          mute: 'Mute {username}',
          unmute: 'Unmute {username}',
        },
        toast: {
          'copy.pubkyCopied': 'Pubky copied to clipboard',
          'copy.profileLinkCopied': 'Profile link copied to clipboard',
          'copy.copyFailed': 'Copy failed',
          'follow.failed': 'Failed to update follow status',
          'mute.muted': 'User muted',
          'mute.unmuted': 'User unmuted',
          'mute.mutedDesc': '{username} has been muted.',
          'mute.unmutedDesc': '{username} has been unmuted.',
          'mute.failed': 'Failed to update mute status',
        },
        errors: {
          title: 'Error',
        },
      };
      return (key: string, params?: Record<string, string>) => {
        let value = translations[namespace]?.[key] || key;
        if (params) {
          Object.entries(params).forEach(([paramKey, paramValue]) => {
            value = value.replace(`{${paramKey}}`, paramValue);
          });
        }
        return value;
      };
    });

    mockUseUserProfile.mockReturnValue({
      profile: defaultMocks.profile,
      isLoading: false,
    });

    mockUseIsFollowing.mockReturnValue({
      isFollowing: defaultMocks.isFollowing,
      isLoading: false,
    });

    mockUseFollowUser.mockReturnValue({
      toggleFollow: defaultMocks.toggleFollow,
      isLoading: defaultMocks.isFollowLoading,
      isUserLoading: defaultMocks.isUserLoading,
    });

    mockUseMuteUser.mockReturnValue({
      toggleMute: defaultMocks.toggleMute,
      isLoading: defaultMocks.isMuteLoading,
      isUserLoading: defaultMocks.isMuteUserLoading,
    });

    mockUseMutedUsers.mockReturnValue({
      mutedUserIds: [],
      mutedUserIdSet: new Set(),
      isMuted: defaultMocks.isMuted,
      isLoading: false,
    });

    mockUseCopyToClipboard.mockReturnValue({
      copyToClipboard: defaultMocks.copyToClipboard,
    });
  });

  describe('Follow action', () => {
    it('returns follow action when not following', () => {
      const { result } = renderHook(() => useProfileMenuActions(mockUserId));

      const followItem = result.current.menuItems.find((item) => item.id === PROFILE_MENU_ACTION_IDS.FOLLOW);
      expect(followItem).toBeDefined();
      expect(followItem?.label).toBe('Follow Test User');
      expect(followItem?.disabled).toBe(false);
    });

    it('returns unfollow action when following', () => {
      mockUseIsFollowing.mockReturnValue({
        isFollowing: true,
        isLoading: false,
      });

      const { result } = renderHook(() => useProfileMenuActions(mockUserId));

      const followItem = result.current.menuItems.find((item) => item.id === PROFILE_MENU_ACTION_IDS.FOLLOW);
      expect(followItem).toBeDefined();
      expect(followItem?.label).toBe('Unfollow Test User');
    });

    it('disables follow action when loading', () => {
      mockUseFollowUser.mockReturnValue({
        toggleFollow: defaultMocks.toggleFollow,
        isLoading: true,
        isUserLoading: defaultMocks.isUserLoading,
      });

      const { result } = renderHook(() => useProfileMenuActions(mockUserId));

      const followItem = result.current.menuItems.find((item) => item.id === PROFILE_MENU_ACTION_IDS.FOLLOW);
      expect(followItem?.disabled).toBe(true);
    });

    it('calls toggleFollow on follow action click', async () => {
      const { result } = renderHook(() => useProfileMenuActions(mockUserId));

      const followItem = result.current.menuItems.find((item) => item.id === PROFILE_MENU_ACTION_IDS.FOLLOW);

      await act(async () => {
        await followItem?.onClick();
      });

      expect(defaultMocks.toggleFollow).toHaveBeenCalledWith(mockUserId, false);
    });

    it('shows error toast when follow fails', async () => {
      const error = new Error('Follow failed');
      vi.mocked(isAppError).mockReturnValue(false);
      defaultMocks.toggleFollow.mockRejectedValue(error);

      const { result } = renderHook(() => useProfileMenuActions(mockUserId));

      const followItem = result.current.menuItems.find((item) => item.id === PROFILE_MENU_ACTION_IDS.FOLLOW);

      await act(async () => {
        await followItem?.onClick();
      });

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith({
          title: 'Error',
          description: 'Failed to update follow status',
        });
      });
    });
  });

  describe('Mute action', () => {
    it('returns mute action when user is not muted', () => {
      const { result } = renderHook(() => useProfileMenuActions(mockUserId));

      const muteItem = result.current.menuItems.find((item) => item.id === PROFILE_MENU_ACTION_IDS.MUTE);
      expect(muteItem).toBeDefined();
      expect(muteItem?.label).toBe('Mute Test User');
      expect(muteItem?.disabled).toBe(false);
    });

    it('returns unmute action when user is muted', () => {
      defaultMocks.isMuted.mockReturnValue(true);

      const { result } = renderHook(() => useProfileMenuActions(mockUserId));

      const muteItem = result.current.menuItems.find((item) => item.id === PROFILE_MENU_ACTION_IDS.MUTE);
      expect(muteItem).toBeDefined();
      expect(muteItem?.label).toBe('Unmute Test User');
    });

    it('disables mute action when loading', () => {
      mockUseMuteUser.mockReturnValue({
        toggleMute: defaultMocks.toggleMute,
        isLoading: true,
        isUserLoading: defaultMocks.isMuteUserLoading,
      });

      const { result } = renderHook(() => useProfileMenuActions(mockUserId));

      const muteItem = result.current.menuItems.find((item) => item.id === PROFILE_MENU_ACTION_IDS.MUTE);
      expect(muteItem?.disabled).toBe(true);
    });

    it('calls toggleMute on mute action click', async () => {
      const { result } = renderHook(() => useProfileMenuActions(mockUserId));

      const muteItem = result.current.menuItems.find((item) => item.id === PROFILE_MENU_ACTION_IDS.MUTE);

      await act(async () => {
        await muteItem?.onClick();
      });

      expect(defaultMocks.toggleMute).toHaveBeenCalledWith(mockUserId, false);
      expect(mockToast).toHaveBeenCalledWith({
        title: 'User muted',
        description: 'Test User has been muted.',
      });
    });

    it('calls toggleMute with true when unmuting', async () => {
      defaultMocks.isMuted.mockReturnValue(true);

      const { result } = renderHook(() => useProfileMenuActions(mockUserId));

      const muteItem = result.current.menuItems.find((item) => item.id === PROFILE_MENU_ACTION_IDS.MUTE);

      await act(async () => {
        await muteItem?.onClick();
      });

      expect(defaultMocks.toggleMute).toHaveBeenCalledWith(mockUserId, true);
      expect(mockToast).toHaveBeenCalledWith({
        title: 'User unmuted',
        description: 'Test User has been unmuted.',
      });
    });

    it('shows error toast when mute fails', async () => {
      const error = new Error('Mute failed');
      vi.mocked(isAppError).mockReturnValue(false);
      defaultMocks.toggleMute.mockRejectedValue(error);

      const { result } = renderHook(() => useProfileMenuActions(mockUserId));

      const muteItem = result.current.menuItems.find((item) => item.id === PROFILE_MENU_ACTION_IDS.MUTE);

      await act(async () => {
        await muteItem?.onClick();
      });

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith({
          title: 'Error',
          description: 'Failed to update mute status',
        });
      });
    });
  });

  describe('Copy actions', () => {
    it('includes copy pubky action', () => {
      const { result } = renderHook(() => useProfileMenuActions(mockUserId));

      const copyPubkyItem = result.current.menuItems.find((item) => item.id === PROFILE_MENU_ACTION_IDS.COPY_PUBKY);
      expect(copyPubkyItem).toBeDefined();
      expect(copyPubkyItem?.label).toBe('Copy user pubky');
    });

    it('calls copyToClipboard with pubky on copy pubky click', async () => {
      const { result } = renderHook(() => useProfileMenuActions(mockUserId));

      const copyPubkyItem = result.current.menuItems.find((item) => item.id === PROFILE_MENU_ACTION_IDS.COPY_PUBKY);

      await act(async () => {
        await copyPubkyItem?.onClick();
      });

      expect(defaultMocks.copyToClipboard).toHaveBeenCalledWith(`pubky${mockUserId}`);
    });

    it('includes copy profile link action', () => {
      const { result } = renderHook(() => useProfileMenuActions(mockUserId));

      const copyLinkItem = result.current.menuItems.find((item) => item.id === PROFILE_MENU_ACTION_IDS.COPY_LINK);
      expect(copyLinkItem).toBeDefined();
      expect(copyLinkItem?.label).toBe('Copy profile link');
    });

    it('calls copyToClipboard with profile URL on copy link click', async () => {
      const { result } = renderHook(() => useProfileMenuActions(mockUserId));

      const copyLinkItem = result.current.menuItems.find((item) => item.id === PROFILE_MENU_ACTION_IDS.COPY_LINK);

      await act(async () => {
        await copyLinkItem?.onClick();
      });

      expect(defaultMocks.copyToClipboard).toHaveBeenCalledWith(`https://example.com/profile/${mockUserId}`);
    });

    it('shows error toast when copy pubky fails', async () => {
      const error = new Error('Copy failed');
      vi.mocked(isAppError).mockReturnValue(false);
      defaultMocks.copyToClipboard.mockRejectedValue(error);

      const { result } = renderHook(() => useProfileMenuActions(mockUserId));

      const copyPubkyItem = result.current.menuItems.find((item) => item.id === PROFILE_MENU_ACTION_IDS.COPY_PUBKY);

      await act(async () => {
        await copyPubkyItem?.onClick();
      });

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith({
          title: 'Error',
          description: 'Copy failed',
        });
      });
    });

    it('shows error toast when copy link fails', async () => {
      const error = new Error('Copy failed');
      vi.mocked(isAppError).mockReturnValue(false);
      defaultMocks.copyToClipboard.mockRejectedValue(error);

      const { result } = renderHook(() => useProfileMenuActions(mockUserId));

      const copyLinkItem = result.current.menuItems.find((item) => item.id === PROFILE_MENU_ACTION_IDS.COPY_LINK);

      await act(async () => {
        await copyLinkItem?.onClick();
      });

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith({
          title: 'Error',
          description: 'Copy failed',
        });
      });
    });
  });

  describe('Loading state', () => {
    it('returns isLoading true when profile is loading', () => {
      mockUseUserProfile.mockReturnValue({
        profile: null,
        isLoading: true,
      });

      const { result } = renderHook(() => useProfileMenuActions(mockUserId));

      expect(result.current.isLoading).toBe(true);
    });

    it('returns isLoading true when following status is loading', () => {
      mockUseIsFollowing.mockReturnValue({
        isFollowing: false,
        isLoading: true,
      });

      const { result } = renderHook(() => useProfileMenuActions(mockUserId));

      expect(result.current.isLoading).toBe(true);
    });

    it('returns isLoading false when all data is loaded', () => {
      const { result } = renderHook(() => useProfileMenuActions(mockUserId));

      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('Username fallback', () => {
    it('uses profile name when available', () => {
      const { result } = renderHook(() => useProfileMenuActions(mockUserId));

      const followItem = result.current.menuItems.find((item) => item.id === PROFILE_MENU_ACTION_IDS.FOLLOW);
      expect(followItem?.label).toContain('Test User');
    });

    it('falls back to user ID when profile name is not available', () => {
      mockUseUserProfile.mockReturnValue({
        profile: null,
        isLoading: false,
      });

      const { result } = renderHook(() => useProfileMenuActions(mockUserId));

      const followItem = result.current.menuItems.find((item) => item.id === PROFILE_MENU_ACTION_IDS.FOLLOW);
      expect(followItem?.label).toContain(mockUserId);
    });
  });

  describe('Menu items order', () => {
    it('returns menu items in correct order', () => {
      const { result } = renderHook(() => useProfileMenuActions(mockUserId));

      const itemIds = result.current.menuItems.map((item) => item.id);
      expect(itemIds).toEqual([
        PROFILE_MENU_ACTION_IDS.FOLLOW,
        PROFILE_MENU_ACTION_IDS.COPY_PUBKY,
        PROFILE_MENU_ACTION_IDS.COPY_LINK,
        PROFILE_MENU_ACTION_IDS.MUTE,
      ]);
    });
  });
});
