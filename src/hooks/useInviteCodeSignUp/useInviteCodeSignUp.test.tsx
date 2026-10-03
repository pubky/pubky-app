import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthController } from '@/controllers/auth/auth';
import { ClientErrorCode, NetworkErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { toast } from '@/molecules/Toaster/toast';
import { useInviteCodeSignUp } from './useInviteCodeSignUp';

const {
  mockSignUp,
  mockClearSecrets,
  mockSetCurrentUserPubky,
  mockSelectSecretKey,
  mockOnboardingGetState,
  mockAuthGetState,
  mockIsAppError,
  mockIsAuthError,
} = vi.hoisted(() => ({
  mockSignUp: vi.fn(),
  mockClearSecrets: vi.fn(),
  mockSetCurrentUserPubky: vi.fn(),
  mockSelectSecretKey: vi.fn(),
  mockOnboardingGetState: vi.fn(),
  mockAuthGetState: vi.fn(),
  mockIsAppError: vi.fn(),
  mockIsAuthError: vi.fn(),
}));

vi.mock('@/controllers/auth/auth', () => ({
  AuthController: { signUp: mockSignUp },
}));
vi.mock('@/stores/onboarding/onboarding.store', () => ({
  useOnboardingStore: { getState: mockOnboardingGetState },
}));
vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: { getState: mockAuthGetState },
}));

vi.mock('@/molecules/Toaster/toast');
vi.mock('@/libs/error/error.utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/libs/error/error.utils')>();
  return {
    ...actual,
    isAppError: mockIsAppError,
    isAuthError: mockIsAuthError,
  };
});

describe('useInviteCodeSignUp', () => {
  const inviteCode = 'AAAA-BBBB-CCCC';
  const mockSecretKey = 'secret-key-hex';

  beforeEach(() => {
    vi.clearAllMocks();
    mockOnboardingGetState.mockReturnValue({
      selectSecretKey: mockSelectSecretKey,
      clearSecrets: mockClearSecrets,
    });
    mockAuthGetState.mockReturnValue({
      setCurrentUserPubky: mockSetCurrentUserPubky,
    });
    mockSelectSecretKey.mockReturnValue(mockSecretKey);
    mockIsAppError.mockReturnValue(false);
    mockIsAuthError.mockReturnValue(false);
  });

  it('returns validateAndSignUp function', () => {
    const { result } = renderHook(() => useInviteCodeSignUp());
    expect(typeof result.current.validateAndSignUp).toBe('function');
  });

  it('calls signUp with secret key from onboarding store', async () => {
    mockSignUp.mockResolvedValue(undefined);

    const { result } = renderHook(() => useInviteCodeSignUp());

    await act(async () => {
      await result.current.validateAndSignUp(inviteCode);
    });

    expect(AuthController.signUp).toHaveBeenCalledWith({
      secretKey: mockSecretKey,
      signupToken: inviteCode,
    });
  });

  it('does not clear state or show toast on success', async () => {
    mockSignUp.mockResolvedValue(undefined);

    const { result } = renderHook(() => useInviteCodeSignUp());

    await act(async () => {
      await result.current.validateAndSignUp(inviteCode);
    });

    expect(mockClearSecrets).not.toHaveBeenCalled();
    expect(mockSetCurrentUserPubky).not.toHaveBeenCalled();
    expect(vi.mocked(toast)).not.toHaveBeenCalled();
  });

  it('clears onboarding secrets on signUp failure (does not touch auth store)', async () => {
    mockSignUp.mockRejectedValue(new Error('Invalid token'));

    const { result } = renderHook(() => useInviteCodeSignUp());

    await expect(
      act(async () => {
        await result.current.validateAndSignUp(inviteCode);
      }),
    ).rejects.toThrow('Invalid token');

    expect(mockClearSecrets).toHaveBeenCalled();
    expect(mockSetCurrentUserPubky).not.toHaveBeenCalled();
  });

  it('shows toast with generic message and throws on non-AppError', async () => {
    mockSignUp.mockRejectedValue(new Error('Invalid token'));

    const { result } = renderHook(() => useInviteCodeSignUp());

    await expect(
      act(async () => {
        await result.current.validateAndSignUp(inviteCode);
      }),
    ).rejects.toThrow();

    expect(vi.mocked(toast)).toHaveBeenCalledWith({
      variant: 'error',
      description: 'Could not sign up. Try again.',
    });
  });

  it('shows toast with invalidInvite message when auth error', async () => {
    const authError = new Error('Invalid token');
    mockSignUp.mockRejectedValue(authError);
    mockIsAppError.mockReturnValue(true);
    mockIsAuthError.mockReturnValue(true);

    const { result } = renderHook(() => useInviteCodeSignUp());

    await expect(
      act(async () => {
        await result.current.validateAndSignUp(inviteCode);
      }),
    ).rejects.toThrow();

    expect(vi.mocked(toast)).toHaveBeenCalledWith({
      variant: 'error',
      description: 'Invite code is invalid or expired.',
    });
  });

  it('retries transient signup failures and succeeds without clearing secrets', async () => {
    const transientError = Err.network(NetworkErrorCode.CONNECTION_FAILED, 'Network down', {
      service: ErrorService.Local,
      operation: 'validateAndSignUp',
      context: { retryAfter: 0.001 },
    });

    mockSignUp.mockRejectedValueOnce(transientError).mockResolvedValueOnce(undefined);
    mockIsAppError.mockReturnValue(true);
    mockIsAuthError.mockReturnValue(false);

    const { result } = renderHook(() => useInviteCodeSignUp());

    await result.current.validateAndSignUp(inviteCode);

    expect(mockSignUp).toHaveBeenCalledTimes(2);
    expect(mockClearSecrets).not.toHaveBeenCalled();
    expect(vi.mocked(toast)).not.toHaveBeenCalled();
  });

  it('keeps secrets after exhausted retryable failures to allow retrying paid signup', async () => {
    const transientError = Err.network(NetworkErrorCode.CONNECTION_FAILED, 'Network down', {
      service: ErrorService.Local,
      operation: 'validateAndSignUp',
      context: { retryAfter: 0.001 },
    });

    mockSignUp.mockRejectedValue(transientError);
    mockIsAppError.mockReturnValue(true);
    mockIsAuthError.mockReturnValue(false);

    const { result } = renderHook(() => useInviteCodeSignUp());

    let caughtError: unknown;
    try {
      await result.current.validateAndSignUp(inviteCode);
    } catch (error) {
      caughtError = error;
    }

    expect(caughtError).toEqual(transientError);
    expect(mockSignUp).toHaveBeenCalledTimes(4);
    expect(mockClearSecrets).not.toHaveBeenCalled();
    expect(vi.mocked(toast)).toHaveBeenCalledWith({
      variant: 'error',
      description: 'Network down',
    });
  });

  describe('sign-up registered by an earlier attempt', () => {
    // The homeserver registers the account (spending the invite code on this keypair) before the SDK
    // publishes the PKDNS record. A publish failure is retryable, and the retry with the same keypair
    // gets 409 Conflict: the keypair must survive, or the registered account is lost with the code.
    const pkarrPublishError = Err.network(
      NetworkErrorCode.CONNECTION_FAILED,
      'Pkarr operation failed: Failed to publish record to the DHT: found a more recent SignedPacket',
      { service: ErrorService.Homeserver, operation: 'signUp', context: { retryAfter: 0.001 } },
    );
    const conflictError = Err.client(ClientErrorCode.CONFLICT, 'User already exists', {
      service: ErrorService.Homeserver,
      operation: 'signUp',
      context: { statusCode: 409 },
    });

    beforeEach(() => {
      mockIsAppError.mockReturnValue(true);
      mockIsAuthError.mockReturnValue(false);
    });

    it('keeps secrets when the retry after a PKARR publish failure is answered with 409 Conflict', async () => {
      mockSignUp.mockRejectedValueOnce(pkarrPublishError).mockRejectedValueOnce(conflictError);

      const { result } = renderHook(() => useInviteCodeSignUp());

      let caughtError: unknown;
      try {
        await result.current.validateAndSignUp(inviteCode);
      } catch (error) {
        caughtError = error;
      }

      expect(caughtError).toBe(conflictError);
      expect(mockSignUp).toHaveBeenCalledTimes(2);
      expect(mockSignUp).toHaveBeenNthCalledWith(2, { secretKey: mockSecretKey, signupToken: inviteCode });
      expect(mockClearSecrets).not.toHaveBeenCalled();
      expect(vi.mocked(toast)).toHaveBeenCalledWith({
        variant: 'error',
        description: 'Your pubky is already registered. Try again to finish signing in.',
      });
    });

    it('keeps secrets on a first-attempt 409 Conflict and does not retry it', async () => {
      // A reload between attempts: the persisted keypair is already registered on the homeserver.
      mockSignUp.mockRejectedValue(conflictError);

      const { result } = renderHook(() => useInviteCodeSignUp());

      await expect(result.current.validateAndSignUp(inviteCode)).rejects.toBe(conflictError);

      expect(mockSignUp).toHaveBeenCalledTimes(1);
      expect(mockClearSecrets).not.toHaveBeenCalled();
      expect(vi.mocked(toast)).toHaveBeenCalledWith({
        variant: 'error',
        description: 'Your pubky is already registered. Try again to finish signing in.',
      });
    });

    it('keeps secrets when a non-retryable rejection follows a retryable failure', async () => {
      // The first attempt may have registered the key; the homeserver rejecting the now spent code on
      // the retry is not proof that it did not.
      const rejectedToken = new Error('Signup token already used');
      mockSignUp.mockRejectedValueOnce(pkarrPublishError).mockRejectedValueOnce(rejectedToken);
      mockIsAuthError.mockReturnValue(true);

      const { result } = renderHook(() => useInviteCodeSignUp());

      await expect(result.current.validateAndSignUp(inviteCode)).rejects.toBe(rejectedToken);

      expect(mockSignUp).toHaveBeenCalledTimes(2);
      expect(mockClearSecrets).not.toHaveBeenCalled();
      expect(vi.mocked(toast)).toHaveBeenCalledWith({
        variant: 'error',
        description: 'Invite code is invalid or expired.',
      });
    });

    it('still clears secrets when the first attempt is rejected outright', async () => {
      mockSignUp.mockRejectedValue(new Error('Invalid signup token'));
      mockIsAuthError.mockReturnValue(true);

      const { result } = renderHook(() => useInviteCodeSignUp());

      await expect(result.current.validateAndSignUp(inviteCode)).rejects.toThrow('Invalid signup token');

      expect(mockSignUp).toHaveBeenCalledTimes(1);
      expect(mockClearSecrets).toHaveBeenCalledTimes(1);
    });
  });
});
