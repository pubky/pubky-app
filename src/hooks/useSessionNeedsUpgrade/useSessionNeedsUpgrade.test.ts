import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useAuthStore } from '@/stores/auth/auth.store';
import { authInitialState } from '@/stores/auth/auth.types';
import { mockRingSession, mockSession } from '@/test-utils/pubky';
import { useSessionNeedsUpgrade } from './useSessionNeedsUpgrade';

describe('useSessionNeedsUpgrade', () => {
  beforeEach(() => {
    useAuthStore.setState(authInitialState);
  });

  it('is false while signed out', () => {
    const { result } = renderHook(() => useSessionNeedsUpgrade());
    expect(result.current).toBe(false);
  });

  it('is true for a session minted before the /priv entries, and false once it is replaced', () => {
    useAuthStore.setState({ session: mockRingSession(['/pub/pubky.app/:rw']) });
    const { result, rerender } = renderHook(() => useSessionNeedsUpgrade());
    expect(result.current).toBe(true);

    useAuthStore.setState({ session: mockSession() });
    rerender();
    expect(result.current).toBe(false);
  });
});
