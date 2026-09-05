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

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('useWhoToFollowFollowPreservation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockToggleFollow.mockResolvedValue(true);
    mockIsUserLoading.mockReturnValue(false);
  });

  it('preserves newly followed users before the follow request resolves', async () => {
    mockToggleFollow.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useWhoToFollowFollowPreservation());

    act(() => {
      void result.current.handleFollowClick('user-1', false, 'User One');
    });

    expect(mockToggleFollow).toHaveBeenCalledWith('user-1', false, 'User One');
    await waitFor(() => {
      expect(result.current.preservedFollowedUserIds).toEqual(['user-1']);
    });
  });

  it('removes preserved users when they are unfollowed', async () => {
    const { result } = renderHook(() => useWhoToFollowFollowPreservation());

    await act(async () => {
      await result.current.handleFollowClick('user-1', false, 'User One');
    });
    await act(async () => {
      await result.current.handleFollowClick('user-1', true, 'User One');
    });

    expect(result.current.preservedFollowedUserIds).toEqual([]);
  });

  it('rolls back optimistic preservation when follow fails', async () => {
    mockToggleFollow.mockResolvedValue(false);
    const { result } = renderHook(() => useWhoToFollowFollowPreservation());

    await act(async () => {
      await result.current.handleFollowClick('user-1', false, 'User One');
    });

    expect(result.current.preservedFollowedUserIds).toEqual([]);
  });

  it('resets preserved users when the reset key changes', async () => {
    const { result, rerender } = renderHook(({ resetKey }) => useWhoToFollowFollowPreservation({ resetKey }), {
      initialProps: { resetKey: '/hot' },
    });

    await act(async () => {
      await result.current.handleFollowClick('user-1', false, 'User One');
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

  it('reports a pending follow until it settles', async () => {
    const follow = deferred<boolean>();
    mockToggleFollow.mockReturnValue(follow.promise);
    const { result } = renderHook(() => useWhoToFollowFollowPreservation());
    expect(result.current.isFollowPending).toBe(false);

    act(() => {
      void result.current.handleFollowClick('user-1', false, 'User One');
    });
    expect(result.current.isFollowPending).toBe(true);

    await act(async () => {
      follow.resolve(true);
      await follow.promise;
    });
    expect(result.current.isFollowPending).toBe(false);
  });

  it('stays pending until every concurrent follow settles', async () => {
    const first = deferred<boolean>();
    const second = deferred<boolean>();
    mockToggleFollow.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { result } = renderHook(() => useWhoToFollowFollowPreservation());

    act(() => {
      void result.current.handleFollowClick('user-1', false, 'User One');
      void result.current.handleFollowClick('user-2', false, 'User Two');
    });
    expect(result.current.isFollowPending).toBe(true);

    await act(async () => {
      first.resolve(true);
      await first.promise;
    });
    // The second follow is still writing; a shared boolean would already have flipped here
    expect(result.current.isFollowPending).toBe(true);

    await act(async () => {
      second.resolve(true);
      await second.promise;
    });
    expect(result.current.isFollowPending).toBe(false);
  });

  it('clears pending when a follow fails', async () => {
    mockToggleFollow.mockResolvedValue(false);
    const { result } = renderHook(() => useWhoToFollowFollowPreservation());

    await act(async () => {
      await result.current.handleFollowClick('user-1', false, 'User One');
    });

    expect(result.current.isFollowPending).toBe(false);
  });
});
