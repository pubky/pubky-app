import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useLocksAuthStore } from '@/stores/locksAuth/locksAuth.store';
import { locksAuthInitialState } from '@/stores/locksAuth/locksAuth.types';
import { useRestoreLocksAuth } from './useRestoreLocksAuth';

const mocks = vi.hoisted(() => ({
  restore: vi.fn(),
  getLockServer: vi.fn((): string | undefined => 'lockpubky'),
}));

vi.mock('@/controllers/locks/locks', () => ({
  LocksController: { restorePersistedLocksSession: mocks.restore },
}));

vi.mock('@/config/network', () => ({
  getLockServer: mocks.getLockServer,
}));

describe('useRestoreLocksAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getLockServer.mockReturnValue('lockpubky');
    useLocksAuthStore.setState({ ...locksAuthInitialState, hasHydrated: true });
  });

  it('restores when hydrated and a lock server is configured', () => {
    renderHook(() => useRestoreLocksAuth());
    expect(mocks.restore).toHaveBeenCalledTimes(1);
  });

  it('no-ops when no lock server is configured', () => {
    mocks.getLockServer.mockReturnValue(undefined);
    renderHook(() => useRestoreLocksAuth());
    expect(mocks.restore).not.toHaveBeenCalled();
  });

  it('no-ops before the store has hydrated', () => {
    useLocksAuthStore.setState({ ...locksAuthInitialState, hasHydrated: false });
    renderHook(() => useRestoreLocksAuth());
    expect(mocks.restore).not.toHaveBeenCalled();
  });

  it('restores after the mounted store finishes hydrating', async () => {
    useLocksAuthStore.setState({ ...locksAuthInitialState, hasHydrated: false });
    renderHook(() => useRestoreLocksAuth());
    expect(mocks.restore).not.toHaveBeenCalled();

    act(() => {
      useLocksAuthStore.setState({ hasHydrated: true });
    });

    await waitFor(() => {
      expect(mocks.restore).toHaveBeenCalledTimes(1);
    });
  });
});
