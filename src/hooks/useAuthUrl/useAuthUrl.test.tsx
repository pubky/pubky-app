import type { Session } from '@synonymdev/pubky';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthController } from '@/controllers/auth/auth';
import { AuthErrorCode, NetworkErrorCode, TimeoutErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { copyToClipboard } from '@/libs/utils/utils';
import { toast } from '@/molecules/Toaster/toast';
import type { TGenerateAuthUrlResult } from '@/services/homeserver/homeserver.types';
import { useAuthUrl } from './useAuthUrl';

vi.mock('@/controllers/auth/auth', () => ({
  AuthController: { getAuthUrl: vi.fn(), getSignupAuthUrl: vi.fn(), getUpgradeAuthUrl: vi.fn() },
}));
vi.mock('@/molecules/Toaster/toast');
vi.mock('@/libs/utils/utils', async (original) => ({
  ...(await original<typeof import('@/libs/utils/utils')>()),
  copyToClipboard: vi.fn(),
}));
function flow(url = 'pubkyauth://grant') {
  let reject!: (error: unknown) => void;
  const value: TGenerateAuthUrlResult = {
    authorizationUrl: url,
    awaitApproval: new Promise<Session>((_, fail) => {
      reject = fail;
    }),
    cancelAuthFlow: vi.fn(),
  };
  return { value, reject };
}
beforeEach(() => vi.clearAllMocks());

describe('useAuthUrl', () => {
  it('resumes on mount and explicitly starts fresh when the user regenerates', async () => {
    vi.mocked(AuthController.getAuthUrl).mockResolvedValue(flow().value);
    const { result } = renderHook(() => useAuthUrl());
    await waitFor(() => expect(result.current.url).toBe('pubkyauth://grant'));
    expect(AuthController.getAuthUrl).toHaveBeenLastCalledWith(false);
    await act(() => result.current.fetchUrl());
    expect(AuthController.getAuthUrl).toHaveBeenLastCalledWith(true);
    expect(result.current.isLoading).toBe(false);
  });
  it('does not fetch when disabled', () => {
    const { result } = renderHook(() => useAuthUrl({ autoFetch: false }));
    expect(result.current.isLoading).toBe(false);
    expect(AuthController.getAuthUrl).not.toHaveBeenCalled();
  });
  it('uses the proper signup flow with the invite code', async () => {
    vi.mocked(AuthController.getSignupAuthUrl).mockResolvedValue(flow().value);
    renderHook(() => useAuthUrl({ type: 'signup', inviteCode: 'invite' }));
    await waitFor(() => expect(AuthController.getSignupAuthUrl).toHaveBeenCalledWith('invite', false));
  });
  it('uses the grant upgrade entry point for the Locks approval screen', async () => {
    vi.mocked(AuthController.getUpgradeAuthUrl).mockResolvedValue(flow().value);
    const { result } = renderHook(() => useAuthUrl({ type: 'upgrade' }));
    await waitFor(() => expect(result.current.url).toBe('pubkyauth://grant'));
    expect(AuthController.getUpgradeAuthUrl).toHaveBeenLastCalledWith(false);
    await act(() => result.current.fetchUrl());
    expect(AuthController.getUpgradeAuthUrl).toHaveBeenLastCalledWith(true);
    expect(AuthController.getAuthUrl).not.toHaveBeenCalled();
  });
  it('finishes loading if another tab already supplied the required permissions', async () => {
    vi.mocked(AuthController.getUpgradeAuthUrl).mockResolvedValue(null);
    const { result } = renderHook(() => useAuthUrl({ type: 'upgrade' }));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(toast).not.toHaveBeenCalled();
  });
  it('keeps controller approval alive and reports a current failure after mobile UI unmount', async () => {
    const pending = flow();
    vi.mocked(AuthController.getAuthUrl).mockResolvedValue(pending.value);
    const { unmount, result } = renderHook(() => useAuthUrl());
    await waitFor(() => expect(result.current.url).not.toBe(''));
    unmount();
    pending.reject(new Error('offline'));
    await act(async () => {});
    expect(pending.value.cancelAuthFlow).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledOnce();
  });
  it('discards stale UI errors after generating a replacement link', async () => {
    const old = flow('old');
    const fresh = flow('new');
    vi.mocked(AuthController.getAuthUrl).mockResolvedValueOnce(old.value).mockResolvedValueOnce(fresh.value);
    const { result } = renderHook(() => useAuthUrl());
    await waitFor(() => expect(result.current.url).toBe('old'));
    await act(() => result.current.fetchUrl());
    await act(async () => old.reject(Object.assign(new Error('canceled'), { name: 'AuthFlowCanceled' })));
    expect(result.current.url).toBe('new');
    expect(toast).not.toHaveBeenCalled();
  });
  it('shows a retry after a failed request', async () => {
    vi.mocked(AuthController.getAuthUrl).mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useAuthUrl());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isExpired).toBe(true);
  });
  it('invalidates the current canceled link without showing an error toast', async () => {
    const pending = flow();
    vi.mocked(AuthController.getAuthUrl).mockResolvedValue(pending.value);
    const { result } = renderHook(() => useAuthUrl());
    await waitFor(() => expect(result.current.url).not.toBe(''));
    await act(async () => pending.reject(Object.assign(new Error('canceled'), { name: 'AuthFlowCanceled' })));
    expect(toast).not.toHaveBeenCalled();
    expect(result.current.url).toBe('');
    expect(result.current.isExpired).toBe(true);
  });
  it('surfaces an environment rejection from controller adoption', async () => {
    const pending = flow();
    vi.mocked(AuthController.getAuthUrl).mockResolvedValue(pending.value);
    const { result } = renderHook(() => useAuthUrl());
    await waitFor(() => expect(result.current.url).not.toBe(''));
    await act(async () =>
      pending.reject(
        Err.auth(AuthErrorCode.WRONG_ENVIRONMENT_HOMESERVER, 'Wrong environment', {
          service: ErrorService.Homeserver,
          operation: 'test',
        }),
      ),
    );
    expect(result.current.isExpired).toBe(true);
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ description: expect.stringContaining('different homeserver') }),
    );
  });
  it('copies only a current nonempty link', async () => {
    vi.mocked(AuthController.getAuthUrl).mockResolvedValue(flow().value);
    const { result } = renderHook(() => useAuthUrl({ autoFetch: false }));
    await result.current.copyAuthUrl();
    expect(copyToClipboard).not.toHaveBeenCalled();
    await act(() => result.current.fetchUrl());
    await result.current.copyAuthUrl();
    expect(copyToClipboard).toHaveBeenCalledWith({ text: 'pubkyauth://grant' });
  });
});

it.each(['signin', 'upgrade'] as const)('expires an idle %s QR without a misleading error toast', async (type) => {
  const pending = flow();
  vi.mocked(AuthController.getAuthUrl).mockResolvedValue(pending.value);
  vi.mocked(AuthController.getUpgradeAuthUrl).mockResolvedValue(pending.value);
  const { result } = renderHook(() => useAuthUrl({ type }));
  await waitFor(() => expect(result.current.url).not.toBe(''));
  await act(async () =>
    pending.reject(
      Err.timeout(TimeoutErrorCode.REQUEST_TIMEOUT, 'Expired', {
        service: ErrorService.Homeserver,
        operation: 'awaitApproval',
      }),
    ),
  );
  expect(result.current.isExpired).toBe(true);
  expect(toast).not.toHaveBeenCalled();
});

it('reports post-approval bootstrap failure once even after subscribers unmount', async () => {
  const pending = flow();
  vi.mocked(AuthController.getAuthUrl).mockResolvedValue(pending.value);
  const first = renderHook(() => useAuthUrl());
  const second = renderHook(() => useAuthUrl());
  await waitFor(() => expect(second.result.current.url).not.toBe(''));
  first.unmount();
  second.unmount();
  await act(async () =>
    pending.reject(
      Err.timeout(TimeoutErrorCode.REQUEST_TIMEOUT, 'Profile timed out', {
        service: ErrorService.Homeserver,
        operation: 'bootstrapProfile',
      }),
    ),
  );
  expect(toast).toHaveBeenCalledOnce();
});

it.each([false, true])(
  'only reports approval authentication failure while its screen is attached (detached: %s)',
  async (detached) => {
    const pending = flow();
    vi.mocked(AuthController.getAuthUrl).mockResolvedValue(pending.value);
    const { result, unmount } = renderHook(() => useAuthUrl());
    await waitFor(() => expect(result.current.url).not.toBe(''));
    if (detached) unmount();
    const error = Err.auth(AuthErrorCode.SESSION_EXPIRED, 'Proof rejected', {
      service: ErrorService.Homeserver,
      operation: 'awaitApproval',
    });
    await act(async () => pending.reject(error));
    expect(toast).toHaveBeenCalledTimes(detached ? 0 : 1);
  },
);

it('does not toast a relay polling failure after leaving the QR screen', async () => {
  const pending = flow();
  vi.mocked(AuthController.getAuthUrl).mockResolvedValue(pending.value);
  const { result, unmount } = renderHook(() => useAuthUrl());
  await waitFor(() => expect(result.current.url).not.toBe(''));
  unmount();
  await act(async () =>
    pending.reject(
      Err.network(NetworkErrorCode.CONNECTION_FAILED, 'Relay offline', {
        service: ErrorService.Homeserver,
        operation: 'awaitApproval',
      }),
    ),
  );
  expect(toast).not.toHaveBeenCalled();
});
