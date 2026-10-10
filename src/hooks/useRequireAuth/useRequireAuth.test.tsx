import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthController } from '@/controllers/auth/auth';
import { toast } from '@/molecules/Toaster/toast';
import { useAuthStore } from '@/stores/auth/auth.store';
import { authInitialState } from '@/stores/auth/auth.types';
import { mockGrantReference, mockSession } from '@/test-utils/pubky';
import { useRequireAuth } from './useRequireAuth';

const navigation = vi.hoisted(() => ({ pathname: '/post/account/post' }));
vi.mock('next/navigation', () => ({ usePathname: () => navigation.pathname }));
vi.mock('@/molecules/Toaster/toast');

const restoring = () =>
  useAuthStore.setState({
    currentUserPubky: 'account',
    generation: 'original',
    session: null,
    sessionReference: mockGrantReference(),
    restoreStatus: 'restoring',
  });
const ready = () => useAuthStore.setState({ session: mockSession(), restoreStatus: 'ready' });

describe('useRequireAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    navigation.pathname = '/post/account/post';
    useAuthStore.setState({ ...authInitialState, hasHydrated: true });
  });
  afterEach(() => vi.useRealTimers());

  it('opens sign-in for a guest without executing the action', () => {
    const action = vi.fn();
    const { result } = renderHook(() => useRequireAuth());
    act(() => expect(result.current.requireAuth(action)).toBeUndefined());
    expect(action).not.toHaveBeenCalled();
    expect(useAuthStore.getState().showSignInDialog).toBe(true);
  });

  it('executes synchronous browser-gesture actions without yielding when ready', () => {
    restoring();
    ready();
    const { result } = renderHook(() => useRequireAuth());
    const action = vi.fn(() => 'file picker opened');
    expect(result.current.requireAuth(action)).toBe('file picker opened');
    expect(action).toHaveBeenCalledOnce();
  });

  it('blocks synchronous controls during restore without opening sign-in', () => {
    restoring();
    const { result } = renderHook(() => useRequireAuth());
    const action = vi.fn();
    act(() => result.current.requireAuth(action));
    expect(action).not.toHaveBeenCalled();
    expect(useAuthStore.getState().showSignInDialog).toBe(false);
  });

  it('waits for the existing restore without starting a new one', async () => {
    restoring();
    const restore = vi.spyOn(AuthController, 'restorePersistedSession');
    const { result } = renderHook(() => useRequireAuth());
    const action = vi.fn();
    const pending = result.current.waitForAuth().then((ok) => {
      if (ok) action();
    });
    expect(action).not.toHaveBeenCalled();
    expect(useAuthStore.getState().showSignInDialog).toBe(false);
    await act(async () => {
      ready();
      await pending;
    });
    expect(action).toHaveBeenCalledOnce();
    expect(restore).not.toHaveBeenCalled();
    restore.mockRestore();
  });

  it('waits through the idle interval before the coordinator starts restoration', async () => {
    restoring();
    useAuthStore.setState({ restoreStatus: 'idle' });
    const { result } = renderHook(() => useRequireAuth());
    const pending = result.current.waitForAuth();
    await act(async () => {
      ready();
      expect(await pending).toBe(true);
    });
  });

  it.each(['temporary-error', 'reauth-required'] as const)(
    'stops on %s and never replays after a later login',
    async (status) => {
      restoring();
      const { result } = renderHook(() => useRequireAuth());
      const action = vi.fn();
      const pending = result.current.waitForAuth().then((ok) => {
        if (ok) action();
      });
      await act(async () => {
        useAuthStore.setState({ restoreStatus: status });
        await pending;
      });
      expect(useAuthStore.getState().showSignInDialog).toBe(status === 'reauth-required');
      expect(toast).toHaveBeenCalledTimes(status === 'temporary-error' ? 1 : 0);
      await act(async () => ready());
      expect(action).not.toHaveBeenCalled();
    },
  );

  it('times out without opening sign-in or leaving a subscription', async () => {
    vi.useFakeTimers();
    restoring();
    const subscribe = vi.spyOn(useAuthStore, 'subscribe');
    const { result } = renderHook(() => useRequireAuth());
    const pending = result.current.waitForAuth();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(12_000);
      expect(await pending).toBe(false);
    });
    expect(useAuthStore.getState().showSignInDialog).toBe(false);
    expect(toast).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    expect(subscribe).toHaveBeenCalled();
    subscribe.mockRestore();
  });

  it.each(['logout', 'account', 'generation'] as const)('cancels quietly when %s changes', async (change) => {
    restoring();
    const { result } = renderHook(() => useRequireAuth());
    const pending = result.current.waitForAuth();
    await act(async () => {
      if (change === 'logout') useAuthStore.setState({ isLoggingOut: true });
      else if (change === 'account') useAuthStore.setState({ currentUserPubky: 'other' });
      else useAuthStore.setState({ generation: 'new-login' });
      expect(await pending).toBe(false);
    });
    expect(toast).not.toHaveBeenCalled();
    expect(useAuthStore.getState().showSignInDialog).toBe(false);
  });

  it.each(['unmount', 'close', 'navigate'] as const)('cancels a wait on %s', async (change) => {
    restoring();
    const { result, rerender, unmount } = renderHook(({ active }) => useRequireAuth(active), {
      initialProps: { active: true },
    });
    const pending = result.current.waitForAuth();
    await act(async () => {
      if (change === 'unmount') unmount();
      else if (change === 'close') rerender({ active: false });
      else {
        navigation.pathname = '/home';
        rerender({ active: true });
      }
    });
    expect(await pending).toBe(false);
    expect(toast).not.toHaveBeenCalled();
  });

  it('ignores duplicate waiting clicks but permits independent targets', async () => {
    restoring();
    const { result } = renderHook(() => useRequireAuth());
    const a = result.current.waitForAuth('alice');
    expect(await result.current.waitForAuth('alice')).toBe(false);
    const b = result.current.waitForAuth('bob');
    await act(async () => {
      ready();
      expect(await a).toBe(true);
      expect(await b).toBe(true);
    });
  });

  it('rejects a stale handler from a previous account', async () => {
    restoring();
    ready();
    const { result } = renderHook(() => useRequireAuth());
    const oldHandler = result.current.waitForAuth;
    act(() => useAuthStore.setState({ currentUserPubky: 'other', generation: 'other' }));
    expect(await oldHandler()).toBe(false);
  });

  it('allows a ready session immediately (SDK bearer renewal does not set restoring)', async () => {
    restoring();
    ready();
    const { result } = renderHook(() => useRequireAuth());
    expect(await result.current.waitForAuth()).toBe(true);
    expect(toast).not.toHaveBeenCalled();
  });
});
