import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BookmarkController } from '@/controllers/bookmark/bookmark';
import { MuteController } from '@/controllers/mute/mute';
import { PostController } from '@/controllers/post/post';
import { UserController } from '@/controllers/user/user';
import { useBookmark } from '@/hooks/useBookmark/useBookmark';
import { useFollowUser } from '@/hooks/useFollowUser/useFollowUser';
import { useMuteUser } from '@/hooks/useMuteUser/useMuteUser';
import { usePost } from '@/hooks/usePost/usePost';
import { useAuthStore } from '@/stores/auth/auth.store';
import { authInitialState } from '@/stores/auth/auth.types';
import { mockGrantReference, mockSession } from '@/test-utils/pubky';

vi.mock('next/navigation', () => ({ usePathname: () => '/post/author/post' }));
vi.mock('@/controllers/bookmark/bookmark', () => ({
  BookmarkController: {
    exists: vi.fn(async () => false),
    commitCreate: vi.fn(async () => {}),
    commitDelete: vi.fn(async () => {}),
  },
}));
vi.mock('@/controllers/user/user', () => ({ UserController: { commitFollow: vi.fn(async () => {}) } }));
vi.mock('@/controllers/post/post', () => ({ PostController: { commitCreate: vi.fn(async () => 'account:new-post') } }));
vi.mock('@/molecules/Toaster/toast');
vi.mock('@/controllers/mute/mute', () => ({ MuteController: { commitMute: vi.fn(async () => {}) } }));

function useActions() {
  const follow = useFollowUser();
  const bookmark = useBookmark('author:post');
  const post = usePost();
  return { follow, bookmark, post };
}

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({
    ...authInitialState,
    hasHydrated: true,
    currentUserPubky: 'account',
    generation: 'original',
    sessionReference: mockGrantReference(),
    restoreStatus: 'restoring',
  });
});

describe('mutations waiting on real auth state', () => {
  it.each(['ready', 'temporary-error', 'reauth-required'] as const)(
    'mutes only after a successful restore (%s)',
    async (restoreStatus) => {
      const { result } = renderHook(() => useMuteUser());
      let pending!: Promise<boolean>;
      act(() => {
        pending = result.current.toggleMute('other', false);
      });
      expect(MuteController.commitMute).not.toHaveBeenCalled();
      expect(result.current.isLoading).toBe(true);
      await act(async () => {
        expect(await result.current.toggleMute('other', false)).toBe(false);
        useAuthStore.setState({ restoreStatus, session: restoreStatus === 'ready' ? mockSession() : null });
        expect(await pending).toBe(restoreStatus === 'ready');
      });
      expect(MuteController.commitMute).toHaveBeenCalledTimes(restoreStatus === 'ready' ? 1 : 0);
    },
  );

  it('does not follow or bookmark before restore, then executes each once', async () => {
    const { result } = renderHook(useActions);
    await waitFor(() => expect(result.current.bookmark.isLoading).toBe(false));
    let follow!: Promise<boolean>;
    let bookmark!: Promise<boolean>;
    act(() => {
      follow = result.current.follow.toggleFollow('other', false);
      bookmark = result.current.bookmark.toggle();
    });
    expect(result.current.follow.isLoading).toBe(true);
    expect(result.current.bookmark.isToggling).toBe(true);
    expect(UserController.commitFollow).not.toHaveBeenCalled();
    expect(BookmarkController.commitCreate).not.toHaveBeenCalled();
    await act(async () => {
      expect(await result.current.follow.toggleFollow('other', false)).toBe(false);
      expect(await result.current.bookmark.toggle()).toBe(false);
      useAuthStore.setState({ session: mockSession(), restoreStatus: 'ready' });
      expect(await follow).toBe(true);
      expect(await bookmark).toBe(true);
    });
    expect(UserController.commitFollow).toHaveBeenCalledOnce();
    expect(BookmarkController.commitCreate).toHaveBeenCalledOnce();
  });

  it.each(['temporary-error', 'reauth-required'] as const)(
    'preserves the post draft after %s',
    async (restoreStatus) => {
      const { result } = renderHook(() => usePost());
      act(() => result.current.setContent('Keep my draft'));
      const onSuccess = vi.fn();
      let posting!: Promise<void>;
      act(() => {
        posting = result.current.post({ onSuccess });
      });
      expect(result.current.isSubmitting).toBe(true);
      expect(PostController.commitCreate).not.toHaveBeenCalled();
      await act(async () => {
        useAuthStore.setState({ restoreStatus });
        await posting;
      });
      expect(result.current.content).toBe('Keep my draft');
      expect(result.current.isSubmitting).toBe(false);
      expect(PostController.commitCreate).not.toHaveBeenCalled();
      expect(onSuccess).not.toHaveBeenCalled();
    },
  );

  it('publishes once after restore even when clicked twice', async () => {
    const { result } = renderHook(() => usePost());
    act(() => result.current.setContent('Queued post'));
    const onSuccess = vi.fn();
    let first!: Promise<void>;
    act(() => {
      first = result.current.post({ onSuccess });
    });
    await act(async () => {
      await result.current.post({ onSuccess });
      useAuthStore.setState({ session: mockSession(), restoreStatus: 'ready' });
      await first;
    });
    expect(PostController.commitCreate).toHaveBeenCalledOnce();
    expect(onSuccess).toHaveBeenCalledOnce();
    expect(result.current.content).toBe('');
  });

  it('cancels publication when its still-mounted dialog closes', async () => {
    const { result, rerender } = renderHook(({ active }) => usePost({ active }), { initialProps: { active: true } });
    act(() => result.current.setContent('Canceled post'));
    let first!: Promise<void>;
    act(() => {
      first = result.current.post({});
    });
    await act(async () => {
      rerender({ active: false });
    });
    await first;
    act(() => useAuthStore.setState({ session: mockSession(), restoreStatus: 'ready' }));
    expect(PostController.commitCreate).not.toHaveBeenCalled();
    expect(result.current.content).toBe('Canceled post');
  });

  it('does not execute an old follow under the incoming account', async () => {
    const { result } = renderHook(() => useFollowUser());
    let first!: Promise<boolean>;
    act(() => {
      first = result.current.toggleFollow('other', false);
    });
    await act(async () => {
      useAuthStore.setState({
        currentUserPubky: 'replacement',
        generation: 'replacement',
        session: mockSession(),
        restoreStatus: 'ready',
      });
      expect(await first).toBe(false);
    });
    expect(UserController.commitFollow).not.toHaveBeenCalled();
  });
});
