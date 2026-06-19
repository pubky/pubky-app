import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpMethod } from '@/libs/http/http.types';
import { useFollowUser } from './useFollowUser';

const {
  mockUseAuthStore,
  mockCommitFollow,
  mockGetDetails,
  mockLogger,
  mockToast,
  mockIsAppError,
  mockIsNetworkError,
} = vi.hoisted(() => ({
  mockUseAuthStore: vi.fn(),
  mockCommitFollow: vi.fn(),
  mockGetDetails: vi.fn(),
  mockLogger: {
    debug: vi.fn(),
    error: vi.fn(),
  },
  mockToast: vi.fn(),
  mockIsAppError: vi.fn(),
  mockIsNetworkError: vi.fn(),
}));

vi.mock('@/libs/error/error.utils', () => ({
  isAppError: (...args: unknown[]) => mockIsAppError(...args),
  isNetworkError: (...args: unknown[]) => mockIsNetworkError(...args),
}));

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: () => mockUseAuthStore(),
}));

vi.mock('@/controllers/user/user', () => ({
  UserController: {
    commitFollow: (...args: unknown[]) => mockCommitFollow(...args),
    getDetails: (...args: unknown[]) => mockGetDetails(...args),
  },
}));

vi.mock('@/libs/logger/logger', () => ({
  Logger: mockLogger,
}));

vi.mock('@/molecules/Toaster/use-toast', () => ({
  toast: (props: unknown) => mockToast(props),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: { username?: string }) => {
    if (key === 'followed') return `Following ${values?.username ?? ''}`;
    if (key === 'unfollowed') return `Unfollowed ${values?.username ?? ''}`;
    if (key === 'failed') return 'Could not update follow status';
    return key;
  },
}));

describe('useFollowUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuthStore.mockReturnValue({ currentUserPubky: 'current-user' });
    mockCommitFollow.mockResolvedValue(undefined);
    mockGetDetails.mockResolvedValue(null);
    mockIsAppError.mockReturnValue(false);
    mockIsNetworkError.mockReturnValue(false);
  });

  it('sets error when user not authenticated', async () => {
    mockUseAuthStore.mockReturnValue({ currentUserPubky: null });

    const { result } = renderHook(() => useFollowUser());

    await act(async () => {
      await result.current.toggleFollow('user-1', false);
    });

    expect(result.current.error).toBe('User not authenticated');
    expect(mockCommitFollow).not.toHaveBeenCalled();
    expect(mockToast).not.toHaveBeenCalled();
  });

  it('sets error when following self', async () => {
    const { result } = renderHook(() => useFollowUser());

    await act(async () => {
      await result.current.toggleFollow('current-user', false);
    });

    expect(result.current.error).toBe('Cannot follow yourself');
    expect(mockCommitFollow).not.toHaveBeenCalled();
  });

  it('shows success toast with provided display name on follow', async () => {
    const { result } = renderHook(() => useFollowUser());

    await act(async () => {
      await result.current.toggleFollow('user-1', false, 'Alice');
    });

    expect(mockCommitFollow).toHaveBeenCalledWith(HttpMethod.PUT, {
      follower: 'current-user',
      followee: 'user-1',
    });
    expect(mockToast).toHaveBeenCalledWith({
      title: 'Following Alice',
    });
    expect(mockGetDetails).not.toHaveBeenCalled();
  });

  it('shows success toast with provided display name on unfollow', async () => {
    const { result } = renderHook(() => useFollowUser());

    await act(async () => {
      await result.current.toggleFollow('user-1', true, 'Alice');
    });

    expect(mockCommitFollow).toHaveBeenCalledWith(HttpMethod.DELETE, {
      follower: 'current-user',
      followee: 'user-1',
    });
    expect(mockToast).toHaveBeenCalledWith({
      title: 'Unfollowed Alice',
    });
  });

  it('resolves display name from profile when not provided', async () => {
    mockGetDetails.mockResolvedValue({ name: 'Bob' });

    const { result } = renderHook(() => useFollowUser());

    await act(async () => {
      await result.current.toggleFollow('user-1', false);
    });

    expect(mockGetDetails).toHaveBeenCalledWith({ userId: 'user-1' });
    expect(mockToast).toHaveBeenCalledWith({
      title: 'Following Bob',
    });
  });

  it('shows generic error toast and resolves false on a non-AppError failure', async () => {
    const error = new Error('Follow failed');
    mockCommitFollow.mockRejectedValue(error);

    const { result } = renderHook(() => useFollowUser());

    let returned: boolean | undefined;
    await act(async () => {
      returned = await result.current.toggleFollow('user-1', false, 'Alice');
    });

    expect(returned).toBe(false);
    await waitFor(() => {
      expect(result.current.error).toBe('Could not update follow status');
    });
    expect(mockToast).toHaveBeenCalledWith({
      variant: 'error',
      description: 'Could not update follow status',
    });
    expect(mockLogger.error).toHaveBeenCalledWith('[useFollowUser] Failed to toggle follow:', error);
  });

  it('surfaces the real message for a non-network AppError', async () => {
    const error = new Error('Homeserver rejected the request');
    mockCommitFollow.mockRejectedValue(error);
    mockIsAppError.mockReturnValue(true);
    mockIsNetworkError.mockReturnValue(false);

    const { result } = renderHook(() => useFollowUser());

    let returned: boolean | undefined;
    await act(async () => {
      returned = await result.current.toggleFollow('user-1', false, 'Alice');
    });

    expect(returned).toBe(false);
    await waitFor(() => {
      expect(result.current.error).toBe('Homeserver rejected the request');
    });
    expect(mockToast).toHaveBeenCalledWith({
      variant: 'error',
      description: 'Homeserver rejected the request',
    });
  });

  it('falls back to the generic message for a network AppError', async () => {
    const error = new Error('fetch failed: ECONNREFUSED');
    mockCommitFollow.mockRejectedValue(error);
    mockIsAppError.mockReturnValue(true);
    mockIsNetworkError.mockReturnValue(true);

    const { result } = renderHook(() => useFollowUser());

    let returned: boolean | undefined;
    await act(async () => {
      returned = await result.current.toggleFollow('user-1', false, 'Alice');
    });

    expect(returned).toBe(false);
    expect(mockToast).toHaveBeenCalledWith({
      variant: 'error',
      description: 'Could not update follow status',
    });
  });
});
