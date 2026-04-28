import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import * as Core from '@/core';
import { asOpaque } from '@/test-utils';
import { usePostMenuActions } from './usePostMenuActions';
import { POST_MENU_ACTION_IDS } from './usePostMenuActions.constants';
import { isAppError } from '@/libs/error/error.utils';

// Hoist mocks
const {
  mockIsAppError,
  mockParseCompositeId,
  mockToast,
  mockUseCurrentUserProfile,
  mockUsePostDetails,
  mockUseUserProfile,
  mockUseIsFollowing,
  mockUseFollowUser,
  mockUseMuteUser,
  mockUseMutedUsers,
  mockUseCopyToClipboard,
} = vi.hoisted(() => ({
  mockIsAppError: vi.fn(),
  mockParseCompositeId: vi.fn(),
  mockToast: vi.fn(),
  mockUseCurrentUserProfile: vi.fn(),
  mockUsePostDetails: vi.fn(),
  mockUseUserProfile: vi.fn(),
  mockUseIsFollowing: vi.fn(),
  mockUseFollowUser: vi.fn(),
  mockUseMuteUser: vi.fn(),
  mockUseMutedUsers: vi.fn(),
  mockUseCopyToClipboard: vi.fn(),
}));

// Mock Core
vi.mock('@/core', () => ({
  parseCompositeId: (id: string) => mockParseCompositeId(id),
}));

// Mock Hooks
vi.mock('@/hooks/useCurrentUserProfile/useCurrentUserProfile', () => ({
  useCurrentUserProfile: mockUseCurrentUserProfile,
}));

vi.mock('@/hooks/usePostDetails/usePostDetails', () => ({
  usePostDetails: mockUsePostDetails,
}));

vi.mock('@/hooks/useUserProfile/useUserProfile', () => ({
  useUserProfile: mockUseUserProfile,
}));

vi.mock('@/hooks/useIsFollowing/useIsFollowing', () => ({
  useIsFollowing: mockUseIsFollowing,
}));

vi.mock('@/hooks/useFollowUser/useFollowUser', () => ({
  useFollowUser: mockUseFollowUser,
}));

vi.mock('@/hooks/useMuteUser/useMuteUser', () => ({
  useMuteUser: mockUseMuteUser,
}));

vi.mock('@/hooks/useMutedUsers/useMutedUsers', () => ({
  useMutedUsers: mockUseMutedUsers,
}));

vi.mock('@/hooks/useCopyToClipboard/useCopyToClipboard', () => ({
  useCopyToClipboard: mockUseCopyToClipboard,
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
    FileText: vi.fn(() => <span>FileText</span>),
    MegaphoneOff: vi.fn(() => <span>MegaphoneOff</span>),
    Megaphone: vi.fn(() => <span>Megaphone</span>),
    Flag: vi.fn(() => <span>Flag</span>),
    Edit: vi.fn(() => <span>Edit</span>),
    Trash: vi.fn(() => <span>Trash</span>),
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

describe('usePostMenuActions', () => {
  const mockPostId = 'pk:author123:post456';
  const mockAuthorId = 'author123';
  const mockCurrentUserId = 'currentUser123';

  const defaultMocks = {
    currentUserPubky: mockCurrentUserId,
    postDetails: {
      id: 'post456',
      content: 'Test post',
      kind: 'short',
      uri: 'pubky://author/pub/pubky.app/posts/post456',
      indexed_at: Date.now(),
      attachments: null,
      is_moderated: false,
      is_blurred: false,
    } satisfies Core.EnrichedPostDetails,
    authorProfile: { name: 'Test Author' },
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

    mockParseCompositeId.mockReturnValue({
      pubky: mockAuthorId,
      id: 'post456',
    });

    mockUseCurrentUserProfile.mockReturnValue({
      currentUserPubky: defaultMocks.currentUserPubky,
    });

    mockUsePostDetails.mockReturnValue({
      postDetails: defaultMocks.postDetails,
      isLoading: false,
    });

    mockUseUserProfile.mockReturnValue({
      profile: defaultMocks.authorProfile,
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

  describe('Menu items for other user posts', () => {
    it('returns follow action when not following', () => {
      const { result } = renderHook(() =>
        usePostMenuActions(mockPostId, { onReportClick: vi.fn(), onEditClick: vi.fn(), onDeleteClick: vi.fn() }),
      );

      const followItem = result.current.menuItems.find((item) => item.id === POST_MENU_ACTION_IDS.FOLLOW);
      expect(followItem).toBeDefined();
      expect(followItem?.label).toBe('Follow Test Author');
      expect(followItem?.disabled).toBe(false);
    });

    it('returns unfollow action when following', () => {
      mockUseIsFollowing.mockReturnValue({
        isFollowing: true,
        isLoading: false,
      });

      const { result } = renderHook(() =>
        usePostMenuActions(mockPostId, { onReportClick: vi.fn(), onEditClick: vi.fn(), onDeleteClick: vi.fn() }),
      );

      const followItem = result.current.menuItems.find((item) => item.id === POST_MENU_ACTION_IDS.FOLLOW);
      expect(followItem).toBeDefined();
      expect(followItem?.label).toBe('Unfollow Test Author');
    });

    it('disables follow action when loading', () => {
      mockUseFollowUser.mockReturnValue({
        toggleFollow: defaultMocks.toggleFollow,
        isLoading: true,
        isUserLoading: defaultMocks.isUserLoading,
      });

      const { result } = renderHook(() =>
        usePostMenuActions(mockPostId, { onReportClick: vi.fn(), onEditClick: vi.fn(), onDeleteClick: vi.fn() }),
      );

      const followItem = result.current.menuItems.find((item) => item.id === POST_MENU_ACTION_IDS.FOLLOW);
      expect(followItem?.disabled).toBe(true);
    });

    it('calls toggleFollow on follow action click', async () => {
      const { result } = renderHook(() =>
        usePostMenuActions(mockPostId, { onReportClick: vi.fn(), onEditClick: vi.fn(), onDeleteClick: vi.fn() }),
      );

      const followItem = result.current.menuItems.find((item) => item.id === POST_MENU_ACTION_IDS.FOLLOW);
      expect(followItem).toBeDefined();

      await act(async () => {
        await followItem?.onClick();
      });

      expect(defaultMocks.toggleFollow).toHaveBeenCalledWith(mockAuthorId, false);
    });

    it('shows error toast when follow fails with AppError', async () => {
      const error = asOpaque<Error>({ type: 'AppError', message: 'Follow failed' });
      vi.mocked(isAppError).mockReturnValue(true);
      defaultMocks.toggleFollow.mockRejectedValue(error);

      const { result } = renderHook(() =>
        usePostMenuActions(mockPostId, { onReportClick: vi.fn(), onEditClick: vi.fn(), onDeleteClick: vi.fn() }),
      );

      const followItem = result.current.menuItems.find((item) => item.id === POST_MENU_ACTION_IDS.FOLLOW);

      await act(async () => {
        await followItem?.onClick();
      });

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith({
          title: 'Error',
          description: 'Follow failed',
        });
      });
    });

    it('shows generic error toast when follow fails with non-AppError', async () => {
      const error = new Error('Follow failed');
      vi.mocked(isAppError).mockReturnValue(false);
      defaultMocks.toggleFollow.mockRejectedValue(error);

      const { result } = renderHook(() =>
        usePostMenuActions(mockPostId, { onReportClick: vi.fn(), onEditClick: vi.fn(), onDeleteClick: vi.fn() }),
      );

      const followItem = result.current.menuItems.find((item) => item.id === POST_MENU_ACTION_IDS.FOLLOW);

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

    it('includes mute action', () => {
      const { result } = renderHook(() =>
        usePostMenuActions(mockPostId, { onReportClick: vi.fn(), onEditClick: vi.fn(), onDeleteClick: vi.fn() }),
      );

      const muteItem = result.current.menuItems.find((item) => item.id === POST_MENU_ACTION_IDS.MUTE);
      expect(muteItem).toBeDefined();
      expect(muteItem?.disabled).toBe(false);
      expect(muteItem?.label).toBe('Mute Test Author');
    });

    it('shows unmute when user is already muted', () => {
      defaultMocks.isMuted.mockReturnValue(true);

      const { result } = renderHook(() =>
        usePostMenuActions(mockPostId, { onReportClick: vi.fn(), onEditClick: vi.fn(), onDeleteClick: vi.fn() }),
      );

      const muteItem = result.current.menuItems.find((item) => item.id === POST_MENU_ACTION_IDS.MUTE);
      expect(muteItem?.label).toBe('Unmute Test Author');
    });

    it('calls toggleMute on mute action click', async () => {
      const { result } = renderHook(() =>
        usePostMenuActions(mockPostId, { onReportClick: vi.fn(), onEditClick: vi.fn(), onDeleteClick: vi.fn() }),
      );

      const muteItem = result.current.menuItems.find((item) => item.id === POST_MENU_ACTION_IDS.MUTE);

      await act(async () => {
        await muteItem?.onClick();
      });

      expect(defaultMocks.toggleMute).toHaveBeenCalledWith(mockAuthorId, false);
      expect(mockToast).toHaveBeenCalledWith({
        title: 'User muted',
        description: 'Test Author has been muted.',
      });
    });

    it('includes report action', () => {
      const { result } = renderHook(() =>
        usePostMenuActions(mockPostId, { onReportClick: vi.fn(), onEditClick: vi.fn(), onDeleteClick: vi.fn() }),
      );

      const reportItem = result.current.menuItems.find((item) => item.id === POST_MENU_ACTION_IDS.REPORT);
      expect(reportItem).toBeDefined();
      expect(reportItem?.label).toBe('Report post');
      expect(reportItem?.disabled).toBeUndefined();
    });

    it('does not include edit action for other user posts', () => {
      const { result } = renderHook(() =>
        usePostMenuActions(mockPostId, { onReportClick: vi.fn(), onEditClick: vi.fn(), onDeleteClick: vi.fn() }),
      );

      const editItem = result.current.menuItems.find((item) => item.id === POST_MENU_ACTION_IDS.EDIT);
      expect(editItem).toBeUndefined();
    });

    it('does not include delete action for other user posts', () => {
      const { result } = renderHook(() =>
        usePostMenuActions(mockPostId, { onReportClick: vi.fn(), onEditClick: vi.fn(), onDeleteClick: vi.fn() }),
      );

      const deleteItem = result.current.menuItems.find((item) => item.id === POST_MENU_ACTION_IDS.DELETE);
      expect(deleteItem).toBeUndefined();
    });
  });

  describe('Menu items for own posts', () => {
    beforeEach(() => {
      mockUseCurrentUserProfile.mockReturnValue({
        currentUserPubky: mockAuthorId,
      });
    });

    it('does not include follow action', () => {
      const { result } = renderHook(() =>
        usePostMenuActions(mockPostId, { onReportClick: vi.fn(), onEditClick: vi.fn(), onDeleteClick: vi.fn() }),
      );

      const followItem = result.current.menuItems.find((item) => item.id === POST_MENU_ACTION_IDS.FOLLOW);
      expect(followItem).toBeUndefined();
    });

    it('does not include mute action', () => {
      const { result } = renderHook(() =>
        usePostMenuActions(mockPostId, { onReportClick: vi.fn(), onEditClick: vi.fn(), onDeleteClick: vi.fn() }),
      );

      const muteItem = result.current.menuItems.find((item) => item.id === POST_MENU_ACTION_IDS.MUTE);
      expect(muteItem).toBeUndefined();
    });

    it('does not include report action', () => {
      const { result } = renderHook(() =>
        usePostMenuActions(mockPostId, { onReportClick: vi.fn(), onEditClick: vi.fn(), onDeleteClick: vi.fn() }),
      );

      const reportItem = result.current.menuItems.find((item) => item.id === POST_MENU_ACTION_IDS.REPORT);
      expect(reportItem).toBeUndefined();
    });

    it('includes edit action', () => {
      const mockOnEditClick = vi.fn();
      const { result } = renderHook(() =>
        usePostMenuActions(mockPostId, {
          onReportClick: vi.fn(),
          onEditClick: mockOnEditClick,
          onDeleteClick: vi.fn(),
        }),
      );

      const editItem = result.current.menuItems.find((item) => item.id === POST_MENU_ACTION_IDS.EDIT);
      expect(editItem).toBeDefined();
      expect(editItem?.label).toBe('Edit post');
      expect(editItem?.variant).toBe('default');
    });

    it('calls onEditClick on edit action click', async () => {
      const mockOnEditClick = vi.fn();
      const { result } = renderHook(() =>
        usePostMenuActions(mockPostId, {
          onReportClick: vi.fn(),
          onEditClick: mockOnEditClick,
          onDeleteClick: vi.fn(),
        }),
      );

      const editItem = result.current.menuItems.find((item) => item.id === POST_MENU_ACTION_IDS.EDIT);

      await act(async () => {
        await editItem?.onClick();
      });

      expect(mockOnEditClick).toHaveBeenCalled();
    });

    it('includes delete action', () => {
      const { result } = renderHook(() =>
        usePostMenuActions(mockPostId, { onReportClick: vi.fn(), onEditClick: vi.fn(), onDeleteClick: vi.fn() }),
      );

      const deleteItem = result.current.menuItems.find((item) => item.id === POST_MENU_ACTION_IDS.DELETE);
      expect(deleteItem).toBeDefined();
      expect(deleteItem?.label).toBe('Delete post');
      expect(deleteItem?.variant).toBe('destructive');
      expect(deleteItem?.disabled).toBe(false);
    });

    it('disables delete action when deleting', () => {
      const { result } = renderHook(() =>
        usePostMenuActions(mockPostId, {
          onReportClick: vi.fn(),
          onEditClick: vi.fn(),
          onDeleteClick: vi.fn(),
          isDeleting: true,
        }),
      );

      const deleteItem = result.current.menuItems.find((item) => item.id === POST_MENU_ACTION_IDS.DELETE);
      expect(deleteItem?.disabled).toBe(true);
    });

    it('calls onDeleteClick on delete action click', async () => {
      const mockOnDeleteClick = vi.fn();
      const { result } = renderHook(() =>
        usePostMenuActions(mockPostId, {
          onReportClick: vi.fn(),
          onEditClick: vi.fn(),
          onDeleteClick: mockOnDeleteClick,
        }),
      );

      const deleteItem = result.current.menuItems.find((item) => item.id === POST_MENU_ACTION_IDS.DELETE);

      await act(async () => {
        await deleteItem?.onClick();
      });

      expect(mockOnDeleteClick).toHaveBeenCalled();
    });
  });

  describe('Copy actions', () => {
    it('includes copy pubky action', () => {
      const { result } = renderHook(() =>
        usePostMenuActions(mockPostId, { onReportClick: vi.fn(), onEditClick: vi.fn(), onDeleteClick: vi.fn() }),
      );

      const copyPubkyItem = result.current.menuItems.find((item) => item.id === POST_MENU_ACTION_IDS.COPY_PUBKY);
      expect(copyPubkyItem).toBeDefined();
      expect(copyPubkyItem?.label).toBe('Copy pubky');
    });

    it('calls copyToClipboard with pubky on copy pubky click', async () => {
      const { result } = renderHook(() =>
        usePostMenuActions(mockPostId, { onReportClick: vi.fn(), onEditClick: vi.fn(), onDeleteClick: vi.fn() }),
      );

      const copyPubkyItem = result.current.menuItems.find((item) => item.id === POST_MENU_ACTION_IDS.COPY_PUBKY);

      await act(async () => {
        await copyPubkyItem?.onClick();
      });

      expect(defaultMocks.copyToClipboard).toHaveBeenCalledWith(`pubky${mockAuthorId}`);
    });

    it('includes copy link action', () => {
      const { result } = renderHook(() =>
        usePostMenuActions(mockPostId, { onReportClick: vi.fn(), onEditClick: vi.fn(), onDeleteClick: vi.fn() }),
      );

      const copyLinkItem = result.current.menuItems.find((item) => item.id === POST_MENU_ACTION_IDS.COPY_LINK);
      expect(copyLinkItem).toBeDefined();
      expect(copyLinkItem?.label).toBe('Copy link to post');
    });

    it('calls copyToClipboard with post URL on copy link click', async () => {
      const { result } = renderHook(() =>
        usePostMenuActions(mockPostId, { onReportClick: vi.fn(), onEditClick: vi.fn(), onDeleteClick: vi.fn() }),
      );

      const copyLinkItem = result.current.menuItems.find((item) => item.id === POST_MENU_ACTION_IDS.COPY_LINK);

      await act(async () => {
        await copyLinkItem?.onClick();
      });

      expect(defaultMocks.copyToClipboard).toHaveBeenCalledWith('https://example.com/post/author123/post456');
    });

    it('includes copy text action for short posts', () => {
      const { result } = renderHook(() =>
        usePostMenuActions(mockPostId, { onReportClick: vi.fn(), onEditClick: vi.fn(), onDeleteClick: vi.fn() }),
      );

      const copyTextItem = result.current.menuItems.find((item) => item.id === POST_MENU_ACTION_IDS.COPY_TEXT);
      expect(copyTextItem).toBeDefined();
      expect(copyTextItem?.label).toBe('Copy text of post');
    });

    it('does not include copy text action for articles', () => {
      mockUsePostDetails.mockReturnValue({
        postDetails: { id: 'post456', content: 'Test article', kind: 'long' },
        isLoading: false,
      });

      const { result } = renderHook(() =>
        usePostMenuActions(mockPostId, { onReportClick: vi.fn(), onEditClick: vi.fn(), onDeleteClick: vi.fn() }),
      );

      const copyTextItem = result.current.menuItems.find((item) => item.id === POST_MENU_ACTION_IDS.COPY_TEXT);
      expect(copyTextItem).toBeUndefined();
    });

    it('calls copyToClipboard with post content on copy text click', async () => {
      const { result } = renderHook(() =>
        usePostMenuActions(mockPostId, { onReportClick: vi.fn(), onEditClick: vi.fn(), onDeleteClick: vi.fn() }),
      );

      const copyTextItem = result.current.menuItems.find((item) => item.id === POST_MENU_ACTION_IDS.COPY_TEXT);

      await act(async () => {
        await copyTextItem?.onClick();
      });

      expect(defaultMocks.copyToClipboard).toHaveBeenCalledWith('Test post');
    });

    it('handles missing post content in copy text', async () => {
      mockUsePostDetails.mockReturnValue({
        postDetails: null,
        isLoading: false,
      });

      const { result } = renderHook(() =>
        usePostMenuActions(mockPostId, { onReportClick: vi.fn(), onEditClick: vi.fn(), onDeleteClick: vi.fn() }),
      );

      const copyTextItem = result.current.menuItems.find((item) => item.id === POST_MENU_ACTION_IDS.COPY_TEXT);

      await act(async () => {
        await copyTextItem?.onClick();
      });

      expect(defaultMocks.copyToClipboard).toHaveBeenCalledWith('');
    });
  });

  describe('Loading state', () => {
    it('returns isLoading true when post details are loading', () => {
      mockUsePostDetails.mockReturnValue({
        postDetails: null,
        isLoading: true,
      });

      const { result } = renderHook(() =>
        usePostMenuActions(mockPostId, { onReportClick: vi.fn(), onEditClick: vi.fn(), onDeleteClick: vi.fn() }),
      );

      expect(result.current.isLoading).toBe(true);
    });

    it('returns isLoading true when author profile is loading', () => {
      mockUseUserProfile.mockReturnValue({
        profile: null,
        isLoading: true,
      });

      const { result } = renderHook(() =>
        usePostMenuActions(mockPostId, { onReportClick: vi.fn(), onEditClick: vi.fn(), onDeleteClick: vi.fn() }),
      );

      expect(result.current.isLoading).toBe(true);
    });

    it('returns isLoading true when following status is loading', () => {
      mockUseIsFollowing.mockReturnValue({
        isFollowing: false,
        isLoading: true,
      });

      const { result } = renderHook(() =>
        usePostMenuActions(mockPostId, { onReportClick: vi.fn(), onEditClick: vi.fn(), onDeleteClick: vi.fn() }),
      );

      expect(result.current.isLoading).toBe(true);
    });

    it('returns isLoading false when all data is loaded', () => {
      const { result } = renderHook(() =>
        usePostMenuActions(mockPostId, { onReportClick: vi.fn(), onEditClick: vi.fn(), onDeleteClick: vi.fn() }),
      );

      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('Username fallback', () => {
    it('uses author profile name when available', () => {
      const { result } = renderHook(() =>
        usePostMenuActions(mockPostId, { onReportClick: vi.fn(), onEditClick: vi.fn(), onDeleteClick: vi.fn() }),
      );

      const followItem = result.current.menuItems.find((item) => item.id === POST_MENU_ACTION_IDS.FOLLOW);
      expect(followItem?.label).toContain('Test Author');
    });

    it('falls back to author ID when profile name is not available', () => {
      mockUseUserProfile.mockReturnValue({
        profile: null,
        isLoading: false,
      });

      const { result } = renderHook(() =>
        usePostMenuActions(mockPostId, { onReportClick: vi.fn(), onEditClick: vi.fn(), onDeleteClick: vi.fn() }),
      );

      const followItem = result.current.menuItems.find((item) => item.id === POST_MENU_ACTION_IDS.FOLLOW);
      expect(followItem?.label).toContain(mockAuthorId);
    });
  });

  describe('Menu items order', () => {
    it('returns menu items in correct order for other user posts', () => {
      const { result } = renderHook(() =>
        usePostMenuActions(mockPostId, { onReportClick: vi.fn(), onEditClick: vi.fn(), onDeleteClick: vi.fn() }),
      );

      const itemIds = result.current.menuItems.map((item) => item.id);
      expect(itemIds).toEqual([
        POST_MENU_ACTION_IDS.FOLLOW,
        POST_MENU_ACTION_IDS.COPY_PUBKY,
        POST_MENU_ACTION_IDS.COPY_LINK,
        POST_MENU_ACTION_IDS.COPY_TEXT,
        POST_MENU_ACTION_IDS.MUTE,
        POST_MENU_ACTION_IDS.REPORT,
      ]);
    });

    it('returns menu items in correct order for own posts', () => {
      mockUseCurrentUserProfile.mockReturnValue({
        currentUserPubky: mockAuthorId,
      });

      const { result } = renderHook(() =>
        usePostMenuActions(mockPostId, { onReportClick: vi.fn(), onEditClick: vi.fn(), onDeleteClick: vi.fn() }),
      );

      const itemIds = result.current.menuItems.map((item) => item.id);
      expect(itemIds).toEqual([
        POST_MENU_ACTION_IDS.COPY_PUBKY,
        POST_MENU_ACTION_IDS.COPY_LINK,
        POST_MENU_ACTION_IDS.COPY_TEXT,
        POST_MENU_ACTION_IDS.EDIT,
        POST_MENU_ACTION_IDS.DELETE,
      ]);
    });
  });
});
