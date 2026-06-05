import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockMouseEvent } from '@/test-utils/react-events';
import { useUserInfoPopoverActions } from './useUserInfoPopoverActions';

const mockPush = vi.fn();
const mockUseFollowUser = vi.fn();
const mockRequireAuth = vi.fn(<T,>(action: () => T) => action());

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock('@/hooks/useRequireAuth/useRequireAuth', () => ({
  useRequireAuth: () => ({
    isAuthenticated: true,
    requireAuth: mockRequireAuth,
  }),
}));

vi.mock('@/hooks/useFollowUser/useFollowUser', () => ({
  useFollowUser: () => mockUseFollowUser(),
}));

vi.mock('@/app/routes', () => ({
  SETTINGS_ROUTES: { EDIT: '/settings/edit' },
}));

describe('useUserInfoPopoverActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseFollowUser.mockReturnValue({
      toggleFollow: vi.fn().mockResolvedValue(undefined),
      isUserLoading: vi.fn(() => false),
    });
  });

  it('navigates to edit route on edit click', () => {
    const { result } = renderHook(() =>
      useUserInfoPopoverActions({
        userId: 'me',
        isCurrentUser: true,
        isFollowing: false,
        isFollowingStatusLoading: false,
      }),
    );

    const event = mockMouseEvent({ preventDefault: vi.fn(), stopPropagation: vi.fn() });
    act(() => {
      result.current.onEditClick(event);
    });

    expect(mockPush).toHaveBeenCalledWith('/settings/edit');
  });

  it('calls toggleFollow for non-current user', async () => {
    const toggleFollow = vi.fn().mockResolvedValue(undefined);
    mockUseFollowUser.mockReturnValue({
      toggleFollow,
      isUserLoading: vi.fn(() => false),
    });

    const { result } = renderHook(() =>
      useUserInfoPopoverActions({
        userId: 'other',
        isCurrentUser: false,
        isFollowing: true,
        isFollowingStatusLoading: false,
      }),
    );

    const event = mockMouseEvent({ preventDefault: vi.fn(), stopPropagation: vi.fn() });
    await act(async () => {
      await result.current.onFollowClick(event);
    });

    expect(toggleFollow).toHaveBeenCalledWith('other', true);
    expect(mockRequireAuth).toHaveBeenCalledTimes(1);
  });

  it('does not call toggleFollow when requireAuth blocks the action', async () => {
    const toggleFollow = vi.fn().mockResolvedValue(undefined);
    mockUseFollowUser.mockReturnValue({
      toggleFollow,
      isUserLoading: vi.fn(() => false),
    });
    mockRequireAuth.mockImplementation(() => undefined);

    const { result } = renderHook(() =>
      useUserInfoPopoverActions({
        userId: 'other',
        isCurrentUser: false,
        isFollowing: false,
        isFollowingStatusLoading: false,
      }),
    );

    const event = mockMouseEvent({ preventDefault: vi.fn(), stopPropagation: vi.fn() });
    await act(async () => {
      await result.current.onFollowClick(event);
    });

    expect(mockRequireAuth).toHaveBeenCalledTimes(1);
    expect(toggleFollow).not.toHaveBeenCalled();
  });

  it('computes loading state from isUserLoading + following status', () => {
    mockUseFollowUser.mockReturnValue({
      toggleFollow: vi.fn(),
      isUserLoading: vi.fn(() => true),
    });

    const { result } = renderHook(() =>
      useUserInfoPopoverActions({
        userId: 'other',
        isCurrentUser: false,
        isFollowing: false,
        isFollowingStatusLoading: false,
      }),
    );

    expect(result.current.isLoading).toBe(true);
  });
});
