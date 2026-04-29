import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { mockMouseEvent } from '@/test-utils/react-events';
import { useUserInfoPopoverActions } from './useUserInfoPopoverActions';

const mockPush = vi.fn();
const mockUseFollowUser = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock('@/hooks/useFollowUser/useFollowUser', () => ({
  useFollowUser: () => mockUseFollowUser(),
}));

vi.mock('@/app', () => ({
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
