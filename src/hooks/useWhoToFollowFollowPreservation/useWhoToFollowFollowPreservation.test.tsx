import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useWhoToFollowFollowPreservation } from './useWhoToFollowFollowPreservation';

const mockToggleFollow = vi.fn();
const mockIsUserLoading = vi.fn(() => false);
let mockIsLoading = false;

vi.mock('@/hooks/useFollowUser/useFollowUser', () => ({
  useFollowUser: () => ({
    toggleFollow: mockToggleFollow,
    isUserLoading: mockIsUserLoading,
    isLoading: mockIsLoading,
  }),
}));

describe('useWhoToFollowFollowPreservation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockToggleFollow.mockResolvedValue(true);
    mockIsUserLoading.mockReturnValue(false);
    mockIsLoading = false;
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
    mockToggleFollow.mockResolvedValue(false);
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

    rerender({ resetKey: '/collections' });

    await waitFor(() => {
      expect(result.current.preservedFollowedUserIds).toEqual([]);
    });
  });

  it('preserves users followed outside handleFollowClick without duplicating', () => {
    const { result } = renderHook(() => useWhoToFollowFollowPreservation());

    act(() => {
      result.current.preserveFollowedUser('user-1');
      result.current.preserveFollowedUser('user-1');
      result.current.preserveFollowedUser('user-2');
    });

    expect(result.current.preservedFollowedUserIds).toEqual(['user-1', 'user-2']);
    expect(mockToggleFollow).not.toHaveBeenCalled();
  });

  it('exposes per-user loading from useFollowUser', () => {
    mockIsUserLoading.mockReturnValue(true);
    const { result } = renderHook(() => useWhoToFollowFollowPreservation());

    expect(result.current.isUserLoading('user-1')).toBe(true);
  });

  it('exposes whether any follow is still committing from useFollowUser', () => {
    // Per-user concurrency is owned by useFollowUser (see its own tests); this hook only forwards it
    const { result, rerender } = renderHook(() => useWhoToFollowFollowPreservation());
    expect(result.current.isFollowPending).toBe(false);

    mockIsLoading = true;
    rerender();

    expect(result.current.isFollowPending).toBe(true);
  });

  it('drops a user from preservation when an external follow fails', () => {
    const { result } = renderHook(() => useWhoToFollowFollowPreservation());

    act(() => {
      result.current.preserveFollowedUser('user-1');
      result.current.preserveFollowedUser('user-2');
    });
    expect(result.current.preservedFollowedUserIds).toEqual(['user-1', 'user-2']);

    act(() => {
      result.current.unpreserveFollowedUser('user-1');
    });

    expect(result.current.preservedFollowedUserIds).toEqual(['user-2']);
    expect(mockToggleFollow).not.toHaveBeenCalled();
  });
});
