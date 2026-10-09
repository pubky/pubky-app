import { Keypair } from '@synonymdev/pubky';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthController } from '@/controllers/auth/auth';
import { createCanceledError } from '@/libs/error/auth-flow-canceled';
import { AuthErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { toast } from '@/molecules/Toaster/toast';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useOnboardingStore } from '@/stores/onboarding/onboarding.store';
import { useSessionRecovery } from './useSessionRecovery';

vi.mock('@/controllers/auth/auth', () => ({
  AuthController: { restorePersistedSession: vi.fn(), loginWithSavedKey: vi.fn() },
}));

vi.mock('@/molecules/Toaster/toast');
beforeEach(() => {
  vi.resetAllMocks();
  useOnboardingStore.getState().reset();
  useAuthStore.getState().reset();
});

describe('useSessionRecovery', () => {
  it('waits for an explicit retry instead of restoring on render', () => {
    const { rerender } = renderHook(() => useSessionRecovery());
    rerender();
    expect(AuthController.restorePersistedSession).not.toHaveBeenCalled();
  });

  it.each([true, false])('returns the controller restore result: %s', async (restored) => {
    vi.mocked(AuthController.restorePersistedSession).mockResolvedValue(restored);
    const { result } = renderHook(() => useSessionRecovery());

    await expect(result.current.retry()).resolves.toBe(restored);
    expect(AuthController.restorePersistedSession).toHaveBeenCalledExactlyOnceWith();
  });

  it('resolves a rejected restore as false so a click handler has no unhandled rejection', async () => {
    vi.mocked(AuthController.restorePersistedSession).mockRejectedValue(
      Err.auth(AuthErrorCode.WRONG_ENVIRONMENT_HOMESERVER, 'Wrong homeserver', {
        service: ErrorService.Homeserver,
        operation: 'restoreSession',
      }),
    );
    const { result } = renderHook(() => useSessionRecovery());

    await expect(result.current.retry()).resolves.toBe(false);
    expect(AuthController.restorePersistedSession).toHaveBeenCalledOnce();
  });

  it('allows a later retry to succeed after an unsuccessful restore', async () => {
    vi.mocked(AuthController.restorePersistedSession).mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const { result } = renderHook(() => useSessionRecovery());

    await expect(result.current.retry()).resolves.toBe(false);
    await expect(result.current.retry()).resolves.toBe(true);
    expect(AuthController.restorePersistedSession).toHaveBeenCalledTimes(2);
  });
});

describe('saved-key recovery', () => {
  it('only offers the retained account matching the saved key', () => {
    const key = Keypair.random();
    useOnboardingStore.setState({ secretKey: Buffer.from(key.secret()).toString('hex') });
    useAuthStore.setState({ currentUserPubky: key.publicKey.z32() });
    const { result } = renderHook(() => useSessionRecovery());
    expect(result.current.hasSavedKey).toBe(true);
    act(() => useAuthStore.setState({ currentUserPubky: Keypair.random().publicKey.z32() }));
    expect(result.current.hasSavedKey).toBe(false);
  });
  it('retries once after saved-key PKARR repair', async () => {
    vi.mocked(AuthController.loginWithSavedKey).mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const { result } = renderHook(() => useSessionRecovery());
    await act(() => result.current.recoverSavedKey());
    expect(AuthController.loginWithSavedKey).toHaveBeenCalledTimes(2);
    expect(toast).not.toHaveBeenCalled();
  });
  it('reports failure when both saved-key attempts need repair', async () => {
    vi.mocked(AuthController.loginWithSavedKey).mockResolvedValue(false);
    const { result } = renderHook(() => useSessionRecovery());
    await act(() => result.current.recoverSavedKey());
    expect(AuthController.loginWithSavedKey).toHaveBeenCalledTimes(2);
    expect(toast).toHaveBeenCalledOnce();
  });
  it.each(['account', 'key'])('does not retry after the recovery %s changes', async (changed) => {
    vi.mocked(AuthController.loginWithSavedKey).mockImplementationOnce(async () => {
      if (changed === 'account') useAuthStore.setState({ currentUserPubky: 'another-account' });
      else useOnboardingStore.setState({ secretKey: 'another-key' });
      return false;
    });
    const { result } = renderHook(() => useSessionRecovery());
    await act(() => result.current.recoverSavedKey());
    expect(AuthController.loginWithSavedKey).toHaveBeenCalledOnce();
    expect(toast).not.toHaveBeenCalled();
  });
  it('reports a failed saved-key recovery without discarding the backup', async () => {
    useOnboardingStore.setState({ secretKey: 'retained-secret' });
    vi.mocked(AuthController.loginWithSavedKey).mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useSessionRecovery());
    await act(() => result.current.recoverSavedKey());
    expect(result.current.isRecoveringKey).toBe(false);
    expect(useOnboardingStore.getState().secretKey).toBe('retained-secret');
    expect(toast).toHaveBeenCalledOnce();
  });
  it('does not announce a superseded key-recovery attempt as an error', async () => {
    vi.mocked(AuthController.loginWithSavedKey).mockRejectedValue(createCanceledError());
    const { result } = renderHook(() => useSessionRecovery());
    await act(() => result.current.recoverSavedKey());
    expect(result.current.isRecoveringKey).toBe(false);
    expect(toast).not.toHaveBeenCalled();
  });
});
