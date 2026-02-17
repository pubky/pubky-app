import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useInviteCodeSignUp } from './useInviteCodeSignUp';
import * as Core from '@/core';
import * as Libs from '@/libs';

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

vi.mock('@/core', () => ({
  AuthController: { signUp: mockSignUp },
  useOnboardingStore: { getState: mockOnboardingGetState },
  useAuthStore: { getState: mockAuthGetState },
}));

const mockToast = vi.fn();
vi.mock('@/molecules', () => ({
  useToast: () => ({ toast: mockToast }),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const t: Record<string, string> = {
      signUpFailed: 'Error - Failed to sign up',
      signUpError: 'Something went wrong. Please try again.',
      invalidInvite: 'Invalid or expired invite code.',
    };
    return t[key] ?? key;
  },
}));

vi.mock('@/libs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/libs')>();
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

    expect(Core.AuthController.signUp).toHaveBeenCalledWith({
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
      title: 'Error - Failed to sign up',
      description: 'Something went wrong. Please try again.',
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
      title: 'Error - Failed to sign up',
      description: 'Invalid or expired invite code.',
    });
  });

  it('retries transient signup failures and succeeds without clearing secrets', async () => {
    const transientError = Libs.Err.network(Libs.NetworkErrorCode.CONNECTION_FAILED, 'Network down', {
      service: Libs.ErrorService.Local,
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
    const transientError = Libs.Err.network(Libs.NetworkErrorCode.CONNECTION_FAILED, 'Network down', {
      service: Libs.ErrorService.Local,
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
      title: 'Error - Failed to sign up',
      description: 'Network down',
    });
  });
});
