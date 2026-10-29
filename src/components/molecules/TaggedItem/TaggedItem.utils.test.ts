import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthErrorCode, NetworkErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { toast } from '@/molecules/Toaster/toast';
import { useAuthStore } from '@/stores/auth/auth.store';
import type { AuthStore } from '@/stores/auth/auth.types';
import { mockAuthStore } from '@/test-utils/stores';
import { showTagWriteErrorToast } from './TaggedItem.utils';

vi.mock('@/molecules/Toaster/toast');
vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: { getState: vi.fn((): AuthStore => mockAuthStore({ restoreStatus: 'ready' })) },
}));

describe('showTagWriteErrorToast', () => {
  beforeEach(() => {
    vi.mocked(useAuthStore.getState).mockReturnValue(mockAuthStore({ restoreStatus: 'ready' }));
  });

  it('prompts sign-in for a write rejected as unauthenticated (#2890)', () => {
    for (const code of [AuthErrorCode.UNAUTHORIZED, AuthErrorCode.SESSION_EXPIRED]) {
      vi.mocked(toast).mockClear();
      showTagWriteErrorToast(
        Err.auth(code, 'Rejected', { service: ErrorService.Homeserver, operation: 'commitCreate' }),
        'Could not add tag',
      );
      expect(vi.mocked(toast)).toHaveBeenCalledTimes(1);
      expect(vi.mocked(toast)).toHaveBeenCalledWith({
        variant: 'error',
        description: 'Session expired. Please sign in.',
      });
    }
  });

  it('keeps the fallback copy for every other failure', () => {
    showTagWriteErrorToast(
      Err.network(NetworkErrorCode.CONNECTION_FAILED, 'Network error', {
        service: ErrorService.Homeserver,
        operation: 'commitCreate',
      }),
      'Could not remove tag',
    );
    showTagWriteErrorToast(new Error('plain'), 'Could not add tag');

    expect(vi.mocked(toast)).toHaveBeenNthCalledWith(1, { variant: 'error', description: 'Could not remove tag' });
    expect(vi.mocked(toast)).toHaveBeenNthCalledWith(2, { variant: 'error', description: 'Could not add tag' });
  });

  it('still prompts sign-in once the 401 closed the owning view, and drops every other failure (#2957)', () => {
    // The whole test runs with the homeserver-ended session, so the generic failures prove the error gate.
    vi.mocked(useAuthStore.getState).mockReturnValue(mockAuthStore({ restoreStatus: 'reauth-required' }));
    showTagWriteErrorToast(
      Err.auth(AuthErrorCode.SESSION_EXPIRED, 'Rejected', {
        service: ErrorService.Homeserver,
        operation: 'commitCreate',
      }),
      'Could not add tag',
      { viewClosed: true },
    );
    showTagWriteErrorToast(
      Err.network(NetworkErrorCode.CONNECTION_FAILED, 'Network error', {
        service: ErrorService.Homeserver,
        operation: 'commitCreate',
      }),
      'Could not add tag',
      { viewClosed: true },
    );
    showTagWriteErrorToast(new Error('plain'), 'Could not remove tag', { viewClosed: true });

    expect(vi.mocked(toast)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(toast)).toHaveBeenCalledWith({
      variant: 'error',
      description: 'Session expired. Please sign in.',
    });
  });

  it('stays silent on a closed view when the session ended by logout, not by the homeserver (#2957)', () => {
    for (const restoreStatus of ['idle', 'ready', 'restoring', 'temporary-error'] as const) {
      vi.mocked(useAuthStore.getState).mockReturnValueOnce(mockAuthStore({ restoreStatus }));
      showTagWriteErrorToast(
        Err.auth(AuthErrorCode.SESSION_EXPIRED, 'Session ended before the homeserver write completed.', {
          service: ErrorService.Homeserver,
          operation: 'queuedWrite',
        }),
        'Could not add tag',
        { viewClosed: true },
      );
    }

    expect(vi.mocked(toast)).not.toHaveBeenCalled();
  });
});
