import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthController } from '@/controllers/auth/auth';
import { AuthErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { useSessionRecovery } from './useSessionRecovery';

vi.mock('@/controllers/auth/auth', () => ({
  AuthController: { restorePersistedSession: vi.fn() },
}));

beforeEach(() => vi.resetAllMocks());

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
