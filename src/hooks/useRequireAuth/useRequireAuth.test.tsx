import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/stores/auth/auth.store';
import { authInitialState } from '@/stores/auth/auth.types';
import { mockSession } from '@/test-utils/pubky';
import { useRequireAuth } from './useRequireAuth';

describe('useRequireAuth', () => {
  beforeEach(() => useAuthStore.setState({ ...authInitialState, hasHydrated: true }));

  it('opens sign-in for a guest without executing the action', () => {
    const action = vi.fn();
    const { result } = renderHook(() => useRequireAuth());
    expect(result.current.isAuthenticated).toBe(false);
    act(() => expect(result.current.requireAuth(action)).toBeUndefined());
    expect(action).not.toHaveBeenCalled();
    expect(useAuthStore.getState().showSignInDialog).toBe(true);
  });

  it('executes and returns the action for a ready session', () => {
    useAuthStore.setState({ currentUserPubky: 'account', session: mockSession(), restoreStatus: 'ready' });
    const { result } = renderHook(() => useRequireAuth());
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.requireAuth(() => 'saved')).toBe('saved');
    expect(useAuthStore.getState().showSignInDialog).toBe(false);
  });

  it.each(['reauth-required', 'temporary-error', 'restoring'] as const)(
    'gates account actions while %s',
    (restoreStatus) => {
      useAuthStore.setState({ currentUserPubky: 'retained-account', session: null, restoreStatus });
      const action = vi.fn();
      const { result } = renderHook(() => useRequireAuth());
      expect(result.current.isAuthenticated).toBe(false);
      act(() => result.current.requireAuth(action));
      expect(action).not.toHaveBeenCalled();
      expect(useAuthStore.getState().showSignInDialog).toBe(true);
    },
  );

  it('checks live state when an older event handler runs after session loss', () => {
    useAuthStore.setState({ currentUserPubky: 'account', session: mockSession(), restoreStatus: 'ready' });
    const { result } = renderHook(() => useRequireAuth());
    const requireAuth = result.current.requireAuth;
    const action = vi.fn();
    act(() => {
      useAuthStore.setState({ session: null, restoreStatus: 'reauth-required' });
      requireAuth(action);
    });
    expect(action).not.toHaveBeenCalled();
    expect(useAuthStore.getState().showSignInDialog).toBe(true);
  });
});
