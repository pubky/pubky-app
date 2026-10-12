import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCanceledError } from '@/libs/error/auth-flow-canceled';
import { toast } from '@/molecules/Toaster/toast';
import { useOnboardingStore } from '@/stores/onboarding/onboarding.store';
import { useSignOut } from './useSignOut';

const mockPush = vi.fn();
const mockLogout = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

vi.mock('@/controllers/auth/auth', () => ({
  AuthController: { logout: (...args: unknown[]) => mockLogout(...args) },
}));

vi.mock('@/molecules/Toaster/toast');

vi.mock('@/app/routes', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/app/routes')>();
  return {
    ...actual,
    AUTH_ROUTES: { LOGOUT: '/logout' },
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  useOnboardingStore.getState().reset();
});

describe('useSignOut', () => {
  it('returns handleSignOut and isLoading', () => {
    const { result } = renderHook(() => useSignOut());

    expect(result.current.handleSignOut).toBeDefined();
    expect(result.current.isLoading).toBe(false);
  });

  it('navigates to logout route on successful sign out', async () => {
    mockLogout.mockResolvedValue(undefined);

    const { result } = renderHook(() => useSignOut());

    await act(async () => {
      await result.current.handleSignOut();
    });

    expect(mockLogout).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith('/logout');
  });

  it('shows error toast on sign out failure', async () => {
    mockLogout.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useSignOut());

    await act(async () => {
      await result.current.handleSignOut();
    });

    expect(vi.mocked(toast)).toHaveBeenCalledWith(
      expect.objectContaining({
        description: 'Could not sign out. Try again.',
      }),
    );
    expect(result.current.isLoading).toBe(false);
  });

  it('sets isLoading to true during sign out', async () => {
    let resolveLogout: () => void;
    mockLogout.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveLogout = resolve;
      }),
    );

    const { result } = renderHook(() => useSignOut());

    let signOutPromise: Promise<void>;
    act(() => {
      signOutPromise = result.current.handleSignOut();
    });

    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      resolveLogout!();
      await signOutPromise!;
    });
  });
});

it('routes an unbacked browser key through backup confirmation before logout', async () => {
  useOnboardingStore.setState({ secretKey: 'unbacked' });
  const { result } = renderHook(() => useSignOut());
  await act(() => result.current.handleSignOut());
  expect(mockLogout).not.toHaveBeenCalled();
  expect(mockPush).toHaveBeenCalledWith('/logout');
  expect(useOnboardingStore.getState().secretKey).toBe('unbacked');
});
it('keeps the current page when another login supersedes signout', async () => {
  mockLogout.mockRejectedValue(createCanceledError());
  const { result } = renderHook(() => useSignOut());
  await act(() => result.current.handleSignOut());
  expect(mockPush).not.toHaveBeenCalled();
  expect(toast).not.toHaveBeenCalled();
  expect(result.current.isLoading).toBe(false);
});
