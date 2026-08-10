import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthController } from '@/controllers/auth/auth';
import { NetworkErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
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

const mockToast = vi.fn();
vi.mock('@/molecules/Toaster/use-toast', () => {
  return {
    useToast: () => ({ toast: mockToast }),
  };
});
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
    expect(mockToast).not.toHaveBeenCalled();
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

    expect(mockToast).toHaveBeenCalledWith({
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

    expect(mockToast).toHaveBeenCalledWith({
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
    expect(mockToast).not.toHaveBeenCalled();
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
    expect(mockToast).toHaveBeenCalledWith({
      variant: 'error',
      description: 'Network down',
    });
  });
});
