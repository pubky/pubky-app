import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useLocksAuthStore } from '@/stores/locksAuth/locksAuth.store';
import { locksAuthInitialState } from '@/stores/locksAuth/locksAuth.types';
import { useRestoreLocksAuth } from './useRestoreLocksAuth';

const mocks = vi.hoisted(() => ({ restore: vi.fn() }));

vi.mock('@/controllers/locks/locks', () => ({
  LocksController: { restorePersistedLocksSession: mocks.restore },
}));

describe('useRestoreLocksAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useLocksAuthStore.setState({ ...locksAuthInitialState, hasHydrated: true });
  });

  it('restores when hydrated and a lock server pubky is provided', () => {
    renderHook(() => useRestoreLocksAuth('lockpubky'));
    expect(mocks.restore).toHaveBeenCalledWith({ lockServerPubky: 'lockpubky' });
  });

  it('no-ops when lockServerPubky is null', () => {
    renderHook(() => useRestoreLocksAuth(null));
    expect(mocks.restore).not.toHaveBeenCalled();
  });

  it('no-ops before the store has hydrated', () => {
    useLocksAuthStore.setState({ ...locksAuthInitialState, hasHydrated: false });
    renderHook(() => useRestoreLocksAuth('lockpubky'));
    expect(mocks.restore).not.toHaveBeenCalled();
  });

  it('restores after the mounted store finishes hydrating', async () => {
    useLocksAuthStore.setState({ ...locksAuthInitialState, hasHydrated: false });
    renderHook(() => useRestoreLocksAuth('lockpubky'));
    expect(mocks.restore).not.toHaveBeenCalled();

    act(() => {
      useLocksAuthStore.setState({ hasHydrated: true });
    });

    await waitFor(() => {
      expect(mocks.restore).toHaveBeenCalledWith({ lockServerPubky: 'lockpubky' });
    });
  });
});
