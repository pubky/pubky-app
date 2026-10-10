import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTH_ROUTES } from '@/app/routes';
import { AuthController } from '@/controllers/auth/auth';
import { ProfileController } from '@/controllers/profile/profile';
import type { Pubky } from '@/models/models.types';
import { toast } from '@/molecules/Toaster/toast';
import { useAuthStore } from '@/stores/auth/auth.store';
import { authInitialState } from '@/stores/auth/auth.types';
import { mockSession } from '@/test-utils/pubky';
import { useDeleteAccount } from './useDeleteAccount';

vi.mock('@/controllers/profile/profile', () => ({
  ProfileController: {
    commitDelete: vi.fn(),
  },
}));

vi.mock('@/controllers/auth/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/controllers/auth/auth')>();
  return { AuthController: { logout: vi.fn(), waitForSession: actual.AuthController.waitForSession } };
});

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  usePathname: () => '/test',
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

vi.mock('@/molecules/Toaster/toast');

describe('useDeleteAccount', () => {
  const mockPubky = 'test-user-pubky' as Pubky;

  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      ...authInitialState,
      hasHydrated: true,
      currentUserPubky: mockPubky,
      session: mockSession(),
      restoreStatus: 'ready',
    });
    vi.mocked(ProfileController.commitDelete).mockResolvedValue(undefined);
    vi.mocked(AuthController.logout).mockResolvedValue(undefined);
  });

  afterEach(() => vi.restoreAllMocks());

  it.each(['temporary-error', 'reauth-required', 'ready'] as const)(
    'blocks an already-open confirmation after the session is removed (%s)',
    async (restoreStatus) => {
      const { result } = renderHook(() => useDeleteAccount());
      const confirmDeletion = result.current.handleDeleteAccount;

      await act(async () => {
        useAuthStore.setState({ session: null, restoreStatus });
        await confirmDeletion();
      });

      expect(ProfileController.commitDelete).not.toHaveBeenCalled();
      expect(AuthController.logout).not.toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalled();
      expect(toast).toHaveBeenCalledTimes(restoreStatus === 'temporary-error' ? 1 : 0);
      expect(result.current.isDeleting).toBe(false);
      expect(result.current.progress).toBe(0);
      expect(useAuthStore.getState().showSignInDialog).toBe(restoreStatus !== 'temporary-error');
    },
  );

  it('requires a new confirmation after a failed restore instead of replaying deletion', async () => {
    const { result } = renderHook(() => useDeleteAccount());
    await act(async () => {
      useAuthStore.setState({ session: null, restoreStatus: 'temporary-error' });
      await result.current.handleDeleteAccount();
    });

    act(() => useAuthStore.setState({ session: mockSession(), restoreStatus: 'ready' }));
    expect(ProfileController.commitDelete).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.handleDeleteAccount();
    });
    expect(ProfileController.commitDelete).toHaveBeenCalledExactlyOnceWith({
      pubky: mockPubky,
      setProgress: expect.any(Function),
    });
  });

  it('cancels a queued deletion when its confirmation dialog closes', async () => {
    useAuthStore.setState({ session: null, restoreStatus: 'restoring' });
    const { result, rerender } = renderHook(({ active }) => useDeleteAccount(active), {
      initialProps: { active: true },
    });
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.handleDeleteAccount();
    });
    expect(result.current.isWaiting).toBe(true);
    expect(result.current.isDeleting).toBe(false);
    await act(async () => rerender({ active: false }));
    await act(async () => {
      useAuthStore.setState({ session: mockSession(), restoreStatus: 'ready' });
      await pending;
    });
    expect(ProfileController.commitDelete).not.toHaveBeenCalled();
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

    expect(vi.mocked(toast)).toHaveBeenCalledWith({
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
    expect(vi.mocked(toast)).not.toHaveBeenCalled();
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
