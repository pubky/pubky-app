import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Session } from '@synonymdev/pubky';
import { useAuthUrl } from './useAuthUrl';

// Mock dependencies
const mockToast = vi.fn();
const mockLoggerError = vi.fn();
const mockGetAuthUrl = vi.fn();
const mockInitializeAuthenticatedSession = vi.fn();
const mockCancelActiveAuthFlow = vi.fn();

vi.mock('@/molecules', () => ({
  toast: (...args: unknown[]) => mockToast(...args),
}));

vi.mock('@/libs', () => ({
  Logger: {
    error: (...args: unknown[]) => mockLoggerError(...args),
  },
}));

vi.mock('@/core', () => ({
  AuthController: {
    getAuthUrl: (...args: unknown[]) => mockGetAuthUrl(...args),
    initializeAuthenticatedSession: (...args: unknown[]) => mockInitializeAuthenticatedSession(...args),
    cancelActiveAuthFlow: (...args: unknown[]) => mockCancelActiveAuthFlow(...args),
  },
  useAuthStore: (selector?: (state: { session: Session | null }) => unknown) => {
    const state = { session: null };
    return selector ? selector(state) : state;
  },
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
    const mockSession = { token: 'test-token' } as unknown as Session;

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

    resolveApproval!(mockSession);

    await waitFor(() => {
      expect(mockInitializeAuthenticatedSession).toHaveBeenCalledWith({ session: mockSession });
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

  it('shows toast when session initialization fails', async () => {
    const mockSession = { token: 'test-token' } as unknown as Session;

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

    resolveApproval!(mockSession);

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
    const mockSession = { token: 'test-token' } as unknown as Session;

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
    resolveApproval!(mockSession);

    await waitFor(() => {
      expect(mockInitializeAuthenticatedSession).toHaveBeenCalledWith({ session: mockSession });
    });
  });
});
