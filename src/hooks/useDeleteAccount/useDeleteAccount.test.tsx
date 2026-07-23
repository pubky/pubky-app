import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTH_ROUTES } from '@/app/routes';
import { AuthController } from '@/controllers/auth/auth';
import { ProfileController } from '@/controllers/profile/profile';
import type { Pubky } from '@/models/models.types';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useDeleteAccount } from './useDeleteAccount';

vi.mock('@/controllers/profile/profile', () => ({
  ProfileController: {
    commitDelete: vi.fn(),
  },
}));

vi.mock('@/controllers/auth/auth', () => ({
  AuthController: {
    logout: vi.fn(),
  },
}));

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

const mockToast = vi.fn();
vi.mock('@/molecules/Toaster/use-toast', () => ({
  useToast: () => ({
    toast: mockToast,
  }),
}));

describe('useDeleteAccount', () => {
  const mockPubky = 'test-user-pubky' as Pubky;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(useAuthStore, 'getState').mockReturnValue({
      selectCurrentUserPubky: () => mockPubky,
    } as ReturnType<typeof useAuthStore.getState>);
    vi.mocked(ProfileController.commitDelete).mockResolvedValue(undefined);
    vi.mocked(AuthController.logout).mockResolvedValue(undefined);
  });

  it('returns initial state', () => {
    const { result } = renderHook(() => useDeleteAccount());

    expect(result.current.isDeleting).toBe(false);
    expect(result.current.progress).toBe(0);
    expect(typeof result.current.handleDeleteAccount).toBe('function');
  });

  it('calls ProfileController.commitDelete with the current user pubky and a progress callback', async () => {
    const { result } = renderHook(() => useDeleteAccount());

    await act(async () => {
      await result.current.handleDeleteAccount();
    });

    expect(ProfileController.commitDelete).toHaveBeenCalledWith({
      pubky: mockPubky,
      setProgress: expect.any(Function),
    });
  });

  it('logs out and redirects to logout page after successful deletion', async () => {
    const { result } = renderHook(() => useDeleteAccount());

    await act(async () => {
      await result.current.handleDeleteAccount();
    });

    expect(ProfileController.commitDelete).toHaveBeenCalledBefore(vi.mocked(AuthController.logout));
    expect(AuthController.logout).toHaveBeenCalledBefore(mockPush);
    expect(mockPush).toHaveBeenCalledWith(AUTH_ROUTES.LOGOUT);
  });

  it('updates progress as deletion advances', async () => {
    let reportProgress: ((progress: number) => void) | undefined;
    let resolveDelete: () => void;
    const deletePromise = new Promise<void>((resolve) => {
      resolveDelete = resolve;
    });
    vi.mocked(ProfileController.commitDelete).mockImplementation(async ({ setProgress }) => {
      reportProgress = setProgress;
      return deletePromise;
    });

    const { result } = renderHook(() => useDeleteAccount());

    act(() => {
      result.current.handleDeleteAccount();
    });

    await waitFor(() => {
      expect(reportProgress).toBeDefined();
    });

    act(() => {
      reportProgress!(42);
    });

    expect(result.current.progress).toBe(42);

    await act(async () => {
      resolveDelete!();
      await deletePromise;
    });
  });

  it('keeps isDeleting true after successful deletion until navigation', async () => {
    const { result } = renderHook(() => useDeleteAccount());

    await act(async () => {
      await result.current.handleDeleteAccount();
    });

    expect(result.current.isDeleting).toBe(true);
  });

  it('shows error toast and resets state on deletion failure', async () => {
    vi.mocked(ProfileController.commitDelete).mockRejectedValue(new Error('Deletion failed'));

    const { result } = renderHook(() => useDeleteAccount());

    await act(async () => {
      await result.current.handleDeleteAccount();
    });

    expect(mockToast).toHaveBeenCalledWith({
      variant: 'error',
      description: 'Failed to delete account. Please try again.',
    });
    expect(result.current.isDeleting).toBe(false);
    expect(result.current.progress).toBe(0);
    expect(AuthController.logout).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('still redirects to logout when logout fails after successful deletion', async () => {
    vi.mocked(AuthController.logout).mockRejectedValue(new Error('Logout failed'));

    const { result } = renderHook(() => useDeleteAccount());

    await act(async () => {
      await result.current.handleDeleteAccount();
    });

    // The account data is already gone, so no misleading "deletion failed" toast
    // and no retryable state — the user is moved to the logout page regardless.
    expect(mockToast).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith(AUTH_ROUTES.LOGOUT);
    expect(result.current.isDeleting).toBe(true);
  });

  it('ignores concurrent calls while deletion is in progress', async () => {
    let resolveDelete: () => void;
    const deletePromise = new Promise<void>((resolve) => {
      resolveDelete = resolve;
    });
    vi.mocked(ProfileController.commitDelete).mockReturnValue(deletePromise);

    const { result } = renderHook(() => useDeleteAccount());

    act(() => {
      result.current.handleDeleteAccount();
    });

    await waitFor(() => {
      expect(result.current.isDeleting).toBe(true);
    });

    await act(async () => {
      await result.current.handleDeleteAccount();
    });

    expect(ProfileController.commitDelete).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveDelete!();
      await deletePromise;
    });
  });
});
