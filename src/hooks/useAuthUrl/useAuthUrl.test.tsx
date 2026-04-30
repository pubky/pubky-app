import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Session } from '@synonymdev/pubky';
import { mockSession } from '@/test-utils';
import { useAuthUrl } from './useAuthUrl';
import { AppError } from '@/libs/error/error';
import { AuthErrorCode, TimeoutErrorCode } from '@/libs/error/error.codes';
import { ErrorCategory, ErrorService } from '@/libs/error/error.types';

// Mock dependencies
const mockToast = vi.fn();
const mockLoggerError = vi.fn();
const mockCopyToClipboard = vi.fn().mockResolvedValue(undefined);
const mockGetAuthUrl = vi.fn();
const mockGetSignupAuthUrl = vi.fn();
const mockInitializeAuthenticatedSession = vi.fn();
const mockCancelActiveAuthFlow = vi.fn();
const mockTranslations = vi.fn((key: string) => {
  const t: Record<string, string> = {
    authInitFailedTitle: 'Sign in failed. Please try again.',
    authInitFailedDescription: 'Unable to complete authorization with Pubky Ring. Please try again.',
    authNotCompletedTitle: 'Authorization was not completed',
    authNotCompletedDescription: 'The signer did not complete authorization. Please try again.',
    qrGenerationFailedTitle: 'QR code generation failed',
    qrGenerationFailedDescription: 'Unable to generate sign-in QR code. Please refresh and try again.',
  };
  return t[key] ?? key;
});

vi.mock('next-intl', () => ({
  useTranslations: () => mockTranslations,
}));

vi.mock('@/molecules', () => ({
  toast: (...args: unknown[]) => mockToast(...args),
}));

vi.mock('@/libs/logger/logger', async () => {
  const actual = await vi.importActual<typeof import('@/libs/logger/logger')>('@/libs/logger/logger');
  return {
    ...actual,
    Logger: {
      ...actual.Logger,
      error: (...args: unknown[]) => mockLoggerError(...args),
    },
  };
});
vi.mock('@/libs/utils/utils', async () => {
  const actual = await vi.importActual<typeof import('@/libs/utils/utils')>('@/libs/utils/utils');
  return {
    ...actual,
    copyToClipboard: (...args: unknown[]) => mockCopyToClipboard(...args),
  };
});

vi.mock('@/controllers/auth/auth', () => ({
  AuthController: {
    getAuthUrl: (...args: unknown[]) => mockGetAuthUrl(...args),
    getSignupAuthUrl: (...args: unknown[]) => mockGetSignupAuthUrl(...args),
    initializeAuthenticatedSession: (...args: unknown[]) => mockInitializeAuthenticatedSession(...args),
    cancelActiveAuthFlow: (...args: unknown[]) => mockCancelActiveAuthFlow(...args),
  },
}));
vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector?: (state: { session: Session | null }) => unknown) => {
    const state = { session: null };
    return selector ? selector(state) : state;
  },
}));
vi.mock('@/services/homeserver/error.utils', () => ({
  AUTH_FLOW_CANCELED_ERROR_NAME: 'AuthFlowCanceled',
}));

describe('useAuthUrl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createCancelAuthFlow = (): (() => void) => vi.fn();

  it('fetches auth URL on mount when autoFetch is enabled', async () => {
    const mockAuthUrl = 'pubkyring://authorize?token=test123';
    const mockAwaitApproval = new Promise<Session>(() => {});

    mockGetAuthUrl.mockResolvedValue({
      authorizationUrl: mockAuthUrl,
      awaitApproval: mockAwaitApproval,
      cancelAuthFlow: createCancelAuthFlow(),
    });

    const { result } = renderHook(() => useAuthUrl());

    expect(result.current.isLoading).toBe(true);
    expect(result.current.url).toBe('');

    await waitFor(() => {
      expect(result.current.url).toBe(mockAuthUrl);
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockGetAuthUrl).toHaveBeenCalledTimes(1);
  });

  it('does not auto-fetch when autoFetch is false', () => {
    const { result } = renderHook(() => useAuthUrl({ autoFetch: false }));

    expect(result.current.isLoading).toBe(false);
    expect(result.current.url).toBe('');
    expect(mockGetAuthUrl).not.toHaveBeenCalled();
  });

  it('allows manual fetchUrl calls', async () => {
    mockGetAuthUrl.mockResolvedValue({
      authorizationUrl: 'pubkyring://authorize?token=manual',
      awaitApproval: new Promise<Session>(() => {}),
      cancelAuthFlow: createCancelAuthFlow(),
    });

    const { result } = renderHook(() => useAuthUrl({ autoFetch: false }));

    await act(async () => {
      await result.current.fetchUrl();
    });

    await waitFor(() => {
      expect(result.current.url).toBe('pubkyring://authorize?token=manual');
      expect(result.current.isLoading).toBe(false);
    });
  });

  it('initializes session when approval succeeds', async () => {
    const session = mockSession();

    let resolveApproval: (session: Session) => void;
    const mockAwaitApproval = new Promise<Session>((resolve) => {
      resolveApproval = resolve;
    });

    mockGetAuthUrl.mockResolvedValue({
      authorizationUrl: 'pubkyring://authorize?token=approval',
      awaitApproval: mockAwaitApproval,
      cancelAuthFlow: createCancelAuthFlow(),
    });

    renderHook(() => useAuthUrl());

    await waitFor(() => {
      expect(mockGetAuthUrl).toHaveBeenCalled();
    });

    resolveApproval!(session);

    await waitFor(() => {
      expect(mockInitializeAuthenticatedSession).toHaveBeenCalledWith({ session });
    });
  });

  it('shows toast when approval rejects', async () => {
    let rejectApproval: (error: Error) => void;
    const mockAwaitApproval = new Promise<Session>((_, reject) => {
      rejectApproval = reject;
    });

    mockGetAuthUrl.mockResolvedValue({
      authorizationUrl: 'pubkyring://authorize?token=rejection',
      awaitApproval: mockAwaitApproval,
      cancelAuthFlow: createCancelAuthFlow(),
    });

    renderHook(() => useAuthUrl());

    await waitFor(() => {
      expect(mockGetAuthUrl).toHaveBeenCalled();
    });

    rejectApproval!(new Error('User cancelled'));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith({
        title: 'Authorization was not completed',
        description: 'The signer did not complete authorization. Please try again.',
      });
    });
  });

  it('does not show toast when approval rejects due to cancellation', async () => {
    let rejectApproval: (error: Error) => void;
    const mockAwaitApproval = new Promise<Session>((_, reject) => {
      rejectApproval = reject;
    });

    mockGetAuthUrl.mockResolvedValue({
      authorizationUrl: 'pubkyring://authorize?token=canceled',
      awaitApproval: mockAwaitApproval,
      cancelAuthFlow: createCancelAuthFlow(),
    });

    renderHook(() => useAuthUrl());

    await waitFor(() => {
      expect(mockGetAuthUrl).toHaveBeenCalled();
    });

    const canceledError = new Error('Auth flow canceled');
    canceledError.name = 'AuthFlowCanceled';
    rejectApproval!(canceledError);

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(mockToast).not.toHaveBeenCalled();
  });

  it('marks flow as expired when SESSION_EXPIRED AppError rejects', async () => {
    let rejectApproval: (error: unknown) => void;
    const mockAwaitApproval = new Promise<Session>((_, reject) => {
      rejectApproval = reject;
    });

    mockGetAuthUrl.mockResolvedValue({
      authorizationUrl: 'pubkyring://authorize?token=session-expired',
      awaitApproval: mockAwaitApproval,
      cancelAuthFlow: createCancelAuthFlow(),
    });

    const { result } = renderHook(() => useAuthUrl());

    await waitFor(() => {
      expect(mockGetAuthUrl).toHaveBeenCalled();
    });

    rejectApproval!(
      new AppError({
        category: ErrorCategory.Auth,
        code: AuthErrorCode.SESSION_EXPIRED,
        message: 'Session expired',
        service: ErrorService.Homeserver,
        operation: 'awaitApproval',
      }),
    );

    await waitFor(() => {
      expect(result.current.isExpired).toBe(true);
      expect(result.current.url).toBe('');
    });
    expect(mockToast).not.toHaveBeenCalled();
  });

  it('marks flow as expired only for timeout-like AppError rejections', async () => {
    let rejectApproval: (error: unknown) => void;
    const mockAwaitApproval = new Promise<Session>((_, reject) => {
      rejectApproval = reject;
    });

    mockGetAuthUrl.mockResolvedValue({
      authorizationUrl: 'pubkyring://authorize?token=timeout',
      awaitApproval: mockAwaitApproval,
      cancelAuthFlow: createCancelAuthFlow(),
    });

    const { result } = renderHook(() => useAuthUrl());

    await waitFor(() => {
      expect(mockGetAuthUrl).toHaveBeenCalled();
    });

    rejectApproval!(
      new AppError({
        category: ErrorCategory.Timeout,
        code: TimeoutErrorCode.REQUEST_TIMEOUT,
        message: 'Auth flow timed out after maximum attempts',
        service: ErrorService.Homeserver,
        operation: 'awaitApproval',
      }),
    );

    await waitFor(() => {
      expect(result.current.isExpired).toBe(true);
      expect(result.current.url).toBe('');
    });
    expect(mockToast).not.toHaveBeenCalled();
  });

  it('shows toast when session initialization fails', async () => {
    const session = mockSession();

    let resolveApproval: (session: Session) => void;
    const mockAwaitApproval = new Promise<Session>((resolve) => {
      resolveApproval = resolve;
    });

    mockGetAuthUrl.mockResolvedValue({
      authorizationUrl: 'pubkyring://authorize?token=init-failure',
      awaitApproval: mockAwaitApproval,
      cancelAuthFlow: createCancelAuthFlow(),
    });

    mockInitializeAuthenticatedSession.mockRejectedValue(new Error('Failed to initialize session'));

    renderHook(() => useAuthUrl());

    await waitFor(() => {
      expect(mockGetAuthUrl).toHaveBeenCalled();
    });

    resolveApproval!(session);

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith({
        title: 'Sign in failed. Please try again.',
        description: 'Unable to complete authorization with Pubky Ring. Please try again.',
      });
    });
  });

  it('shows toast when getAuthUrl fails', async () => {
    mockGetAuthUrl.mockRejectedValue(new Error('Network error'));

    renderHook(() => useAuthUrl());

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith({
        title: 'QR code generation failed',
        description: 'Unable to generate sign-in QR code. Please refresh and try again.',
      });
    });
  });

  it('does not cancel active auth flow on unmount', async () => {
    mockGetAuthUrl.mockResolvedValue({
      authorizationUrl: 'pubkyring://authorize?token=unmount',
      awaitApproval: new Promise<Session>(() => {}),
      cancelAuthFlow: createCancelAuthFlow(),
    });

    const { unmount } = renderHook(() => useAuthUrl());

    await waitFor(() => {
      expect(mockGetAuthUrl).toHaveBeenCalled();
    });

    unmount();
    expect(mockCancelActiveAuthFlow).not.toHaveBeenCalled();
  });

  it('initializes session even after component unmounts', async () => {
    const session = mockSession();

    let resolveApproval: (session: Session) => void;
    const mockAwaitApproval = new Promise<Session>((resolve) => {
      resolveApproval = resolve;
    });

    mockGetAuthUrl.mockResolvedValue({
      authorizationUrl: 'pubkyring://authorize?token=post-unmount',
      awaitApproval: mockAwaitApproval,
      cancelAuthFlow: createCancelAuthFlow(),
    });

    const { unmount } = renderHook(() => useAuthUrl());

    await waitFor(() => {
      expect(mockGetAuthUrl).toHaveBeenCalled();
    });

    unmount();
    resolveApproval!(session);

    await waitFor(() => {
      expect(mockInitializeAuthenticatedSession).toHaveBeenCalledWith({ session });
    });
  });

  it('calls AuthController.getSignupAuthUrl when type is signup with inviteCode', async () => {
    const mockAuthUrl = 'pubkyring://authorize?token=signup';

    mockGetSignupAuthUrl.mockResolvedValue({
      authorizationUrl: mockAuthUrl,
      awaitApproval: new Promise<Session>(() => {}),
      cancelAuthFlow: createCancelAuthFlow(),
    });

    const { result } = renderHook(() => useAuthUrl({ type: 'signup', inviteCode: 'A9KM-7MJP-ERM9' }));

    await waitFor(() => {
      expect(result.current.url).toBe(mockAuthUrl);
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockGetSignupAuthUrl).toHaveBeenCalledWith('A9KM-7MJP-ERM9');
    expect(mockGetAuthUrl).not.toHaveBeenCalled();
  });

  it('copyAuthUrl copies url to clipboard', async () => {
    mockGetAuthUrl.mockResolvedValue({
      authorizationUrl: 'pubkyring://authorize?token=copy',
      awaitApproval: new Promise<Session>(() => {}),
      cancelAuthFlow: createCancelAuthFlow(),
    });

    const { result } = renderHook(() => useAuthUrl());

    await waitFor(() => {
      expect(result.current.url).toBe('pubkyring://authorize?token=copy');
    });

    await act(async () => {
      await result.current.copyAuthUrl();
    });

    expect(mockCopyToClipboard).toHaveBeenCalledWith({ text: 'pubkyring://authorize?token=copy' });
  });

  it('copyAuthUrl does nothing when url is empty', async () => {
    const { result } = renderHook(() => useAuthUrl({ autoFetch: false }));

    await act(async () => {
      await result.current.copyAuthUrl();
    });

    expect(mockCopyToClipboard).not.toHaveBeenCalled();
  });
});
