import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpMethod } from '@/libs/http/http.types';
import { toast } from '@/molecules/Toaster/toast';
import { useFollowAll } from './useFollowAll';

const { mockCommitFollow, mockLogger } = vi.hoisted(() => ({
  mockCommitFollow: vi.fn(),
  mockLogger: { debug: vi.fn(), error: vi.fn() },
}));

let mockCurrentUserPubky: string | null = 'viewer';
vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (state: { currentUserPubky: string | null }) => unknown) =>
    selector({ currentUserPubky: mockCurrentUserPubky }),
}));

vi.mock('@/controllers/user/user', () => ({
  UserController: {
    commitFollow: (...args: unknown[]) => mockCommitFollow(...args),
  },
}));

vi.mock('@/libs/logger/logger', () => ({
  Logger: mockLogger,
}));

vi.mock('@/molecules/Toaster/toast');

describe('useFollowAll', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCurrentUserPubky = 'viewer';
    mockCommitFollow.mockResolvedValue(undefined);
  });

  it('follows every unfollowed target sequentially and skips already-followed ones', async () => {
    const onFollowed = vi.fn();
    const { result } = renderHook(() => useFollowAll({ onFollowed }));

    let outcome: Awaited<ReturnType<typeof result.current.followAll>> | undefined;
    await act(async () => {
      outcome = await result.current.followAll([
        { id: 'a' },
        { id: 'b', isFollowing: true },
        { id: 'c', isFollowing: false },
      ]);
    });

    expect(mockCommitFollow).toHaveBeenCalledTimes(2);
    expect(mockCommitFollow).toHaveBeenNthCalledWith(1, HttpMethod.PUT, { follower: 'viewer', followee: 'a' });
    expect(mockCommitFollow).toHaveBeenNthCalledWith(2, HttpMethod.PUT, { follower: 'viewer', followee: 'c' });
    expect(onFollowed.mock.calls.map(([id]) => id)).toEqual(['a', 'c']);
    expect(outcome).toEqual({ followed: ['a', 'c'], failed: [], skipped: ['b'] });
    expect(vi.mocked(toast)).toHaveBeenCalledWith({ variant: 'default', title: 'Following 2 people' });
    expect(result.current.isRunning).toBe(false);
    expect(result.current.progress).toEqual({ completed: 0, total: 0 });
  });

  it('awaits each commit before starting the next one', async () => {
    const order: string[] = [];
    let releaseFirst: (() => void) | undefined;
    mockCommitFollow.mockImplementation((_method: unknown, { followee }: { followee: string }) => {
      order.push(`start:${followee}`);
      if (followee === 'a') {
        return new Promise<void>((resolve) => {
          releaseFirst = () => {
            order.push('end:a');
            resolve();
          };
        });
      }
      order.push(`end:${followee}`);
      return Promise.resolve();
    });

    const { result } = renderHook(() => useFollowAll());

    let run: Promise<unknown> | undefined;
    act(() => {
      run = result.current.followAll([{ id: 'a' }, { id: 'b' }]);
    });

    await waitFor(() => expect(result.current.isRunning).toBe(true));
    expect(result.current.progress).toEqual({ completed: 0, total: 2 });
    expect(order).toEqual(['start:a']);

    await act(async () => {
      releaseFirst?.();
      await run;
    });

    expect(order).toEqual(['start:a', 'end:a', 'start:b', 'end:b']);
  });

  it('collects partial failures, keeps going, and surfaces one warning toast', async () => {
    mockCommitFollow.mockImplementation((_method: unknown, { followee }: { followee: string }) =>
      followee === 'b' ? Promise.reject(new Error('homeserver down')) : Promise.resolve(),
    );
    const onFollowed = vi.fn();
    const { result } = renderHook(() => useFollowAll({ onFollowed }));

    let outcome: Awaited<ReturnType<typeof result.current.followAll>> | undefined;
    await act(async () => {
      outcome = await result.current.followAll([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
    });

    expect(outcome).toEqual({ followed: ['a', 'c'], failed: ['b'], skipped: [] });
    expect(onFollowed).toHaveBeenCalledTimes(2);
    expect(mockLogger.error).toHaveBeenCalledTimes(1);
    expect(vi.mocked(toast)).toHaveBeenCalledWith({
      variant: 'warning',
      title: 'Followed 2 of 3 people, 1 failed',
    });
  });

  it('shows an error toast when every follow fails but still resolves', async () => {
    mockCommitFollow.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useFollowAll());

    let outcome: Awaited<ReturnType<typeof result.current.followAll>> | undefined;
    await act(async () => {
      outcome = await result.current.followAll([{ id: 'a' }]);
    });

    expect(outcome).toEqual({ followed: [], failed: ['a'], skipped: [] });
    expect(vi.mocked(toast)).toHaveBeenCalledWith({
      variant: 'error',
      description: 'Failed to follow suggested people',
    });
  });

  it('does nothing when there is no unfollowed target', async () => {
    const { result } = renderHook(() => useFollowAll());

    let outcome: Awaited<ReturnType<typeof result.current.followAll>> | undefined;
    await act(async () => {
      outcome = await result.current.followAll([{ id: 'a', isFollowing: true }, { id: 'viewer' }]);
    });

    expect(mockCommitFollow).not.toHaveBeenCalled();
    expect(vi.mocked(toast)).not.toHaveBeenCalled();
    expect(outcome).toEqual({ followed: [], failed: [], skipped: ['a', 'viewer'] });
  });

  it('does nothing without an authenticated viewer', async () => {
    mockCurrentUserPubky = null;
    const { result } = renderHook(() => useFollowAll());

    await act(async () => {
      await result.current.followAll([{ id: 'a' }]);
    });

    expect(mockCommitFollow).not.toHaveBeenCalled();
  });

  it('ignores a second call while a run is in flight', async () => {
    let release: (() => void) | undefined;
    mockCommitFollow.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const { result } = renderHook(() => useFollowAll());

    let first: Promise<unknown> | undefined;
    let second: Awaited<ReturnType<typeof result.current.followAll>> | undefined;
    await act(async () => {
      first = result.current.followAll([{ id: 'a' }]);
      second = await result.current.followAll([{ id: 'b' }]);
    });

    expect(second).toEqual({ followed: [], failed: [], skipped: [] });
    expect(mockCommitFollow).toHaveBeenCalledTimes(1);

    await act(async () => {
      release?.();
      await first;
    });
  });

  it('uses singular copy for a single follow', async () => {
    const { result } = renderHook(() => useFollowAll());

    await act(async () => {
      await result.current.followAll([{ id: 'a' }]);
    });

    expect(vi.mocked(toast)).toHaveBeenCalledWith({ variant: 'default', title: 'Following 1 person' });
  });
});
