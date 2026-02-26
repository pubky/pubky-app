import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useSignOut } from './useSignOut';

const mockPush = vi.fn();
const mockLogout = vi.fn();
const mockToast = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

vi.mock('@/core', () => ({
  AuthController: { logout: (...args: unknown[]) => mockLogout(...args) },
}));

vi.mock('@/molecules', () => ({
  useToast: () => ({ toast: mockToast }),
}));

vi.mock('@/app', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/app')>();
  return {
    ...actual,
    AUTH_ROUTES: { LOGOUT: '/logout' },
  };
});

beforeEach(() => {
  vi.clearAllMocks();
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

    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        description: 'Failed to sign out. Please try again.',
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
