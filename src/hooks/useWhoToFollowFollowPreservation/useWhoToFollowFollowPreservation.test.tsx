import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useWhoToFollowFollowPreservation } from './useWhoToFollowFollowPreservation';

const mockToggleFollow = vi.fn();
const mockIsUserLoading = vi.fn(() => false);

vi.mock('@/hooks/useFollowUser/useFollowUser', () => ({
  useFollowUser: () => ({
    toggleFollow: mockToggleFollow,
    isUserLoading: mockIsUserLoading,
  }),
}));

describe('useWhoToFollowFollowPreservation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockToggleFollow.mockResolvedValue(undefined);
    mockIsUserLoading.mockReturnValue(false);
  });

  it('preserves newly followed users before the follow request resolves', async () => {
    mockToggleFollow.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useWhoToFollowFollowPreservation());

    act(() => {
      void result.current.handleFollowClick('user-1', false);
    });

    expect(mockToggleFollow).toHaveBeenCalledWith('user-1', false);
    await waitFor(() => {
      expect(result.current.preservedFollowedUserIds).toEqual(['user-1']);
    });
  });

  it('removes preserved users when they are unfollowed', async () => {
    const { result } = renderHook(() => useWhoToFollowFollowPreservation());

    await act(async () => {
      await result.current.handleFollowClick('user-1', false);
    });
    await act(async () => {
      await result.current.handleFollowClick('user-1', true);
    });

    expect(result.current.preservedFollowedUserIds).toEqual([]);
  });

  it('rolls back optimistic preservation when follow fails', async () => {
    mockToggleFollow.mockRejectedValue(new Error('follow failed'));
    const { result } = renderHook(() => useWhoToFollowFollowPreservation());

    await act(async () => {
      await result.current.handleFollowClick('user-1', false);
    });

    expect(result.current.preservedFollowedUserIds).toEqual([]);
  });

  it('resets preserved users when the reset key changes', async () => {
    const { result, rerender } = renderHook(({ resetKey }) => useWhoToFollowFollowPreservation({ resetKey }), {
      initialProps: { resetKey: '/hot' },
    });

    await act(async () => {
      await result.current.handleFollowClick('user-1', false);
    });
    expect(result.current.preservedFollowedUserIds).toEqual(['user-1']);

    rerender({ resetKey: '/bookmarks' });

    await waitFor(() => {
      expect(result.current.preservedFollowedUserIds).toEqual([]);
    });
  });

  it('exposes per-user loading from useFollowUser', () => {
    mockIsUserLoading.mockReturnValue(true);
    const { result } = renderHook(() => useWhoToFollowFollowPreservation());

    expect(result.current.isUserLoading('user-1')).toBe(true);
  });
});
