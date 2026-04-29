import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useRequireAuth } from './useRequireAuth';

const mockCurrentUserPubky = vi.hoisted(() => ({ value: null as string | null }));
const mockSetShowSignInDialog = vi.hoisted(() => vi.fn());

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: Object.assign(
    (selector: (state: { currentUserPubky: string | null }) => unknown) =>
      selector({ currentUserPubky: mockCurrentUserPubky.value }),
    {
      getState: () => ({
        currentUserPubky: mockCurrentUserPubky.value,
        setShowSignInDialog: mockSetShowSignInDialog,
      }),
    },
  ),
}));

describe('useRequireAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCurrentUserPubky.value = null;
  });

  describe('isAuthenticated', () => {
    it('should return false when user is not authenticated', () => {
      mockCurrentUserPubky.value = null;

      const { result } = renderHook(() => useRequireAuth());

      expect(result.current.isAuthenticated).toBe(false);
    });

    it('should return true when user is authenticated', () => {
      mockCurrentUserPubky.value = 'test-pubky-123';

      const { result } = renderHook(() => useRequireAuth());

      expect(result.current.isAuthenticated).toBe(true);
    });
  });

  describe('requireAuth', () => {
    it('should execute action and return result when user is authenticated', () => {
      mockCurrentUserPubky.value = 'test-pubky-123';
      const mockAction = vi.fn(() => 'action-result');

      const { result } = renderHook(() => useRequireAuth());

      let returnValue: string | undefined;
      act(() => {
        returnValue = result.current.requireAuth(mockAction);
      });

      expect(mockAction).toHaveBeenCalledTimes(1);
      expect(returnValue).toBe('action-result');
      expect(mockSetShowSignInDialog).not.toHaveBeenCalled();
    });

    it('should open sign in dialog and return undefined when user is not authenticated', () => {
      mockCurrentUserPubky.value = null;
      const mockAction = vi.fn(() => 'action-result');

      const { result } = renderHook(() => useRequireAuth());

      let returnValue: string | undefined;
      act(() => {
        returnValue = result.current.requireAuth(mockAction);
      });

      expect(mockAction).not.toHaveBeenCalled();
      expect(returnValue).toBeUndefined();
      expect(mockSetShowSignInDialog).toHaveBeenCalledWith(true);
    });

    it('should be memoized and not change reference when dependencies stay the same', () => {
      mockCurrentUserPubky.value = 'test-pubky-123';

      const { result, rerender } = renderHook(() => useRequireAuth());
      const firstRequireAuth = result.current.requireAuth;

      rerender();

      expect(result.current.requireAuth).toBe(firstRequireAuth);
    });
  });
});
