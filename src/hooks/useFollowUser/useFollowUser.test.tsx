import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpMethod } from '@/libs/http/http.types';
import { useFollowUser } from './useFollowUser';

const { mockUseAuthStore, mockCommitFollow, mockGetDetails, mockLogger, mockToast } = vi.hoisted(() => ({
  mockUseAuthStore: vi.fn(),
  mockCommitFollow: vi.fn(),
  mockGetDetails: vi.fn(),
  mockLogger: {
    debug: vi.fn(),
    error: vi.fn(),
  },
  mockToast: vi.fn(),
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
    if (key === 'followed') return `You're now following ${values?.username ?? ''}`;
    if (key === 'unfollowed') return `You're no longer following ${values?.username ?? ''}`;
    if (key === 'followFailed') return `Could not follow ${values?.username ?? ''}. Please try again.`;
    if (key === 'unfollowFailed') return `Could not unfollow ${values?.username ?? ''}. Please try again.`;
    if (key === 'loginRequired') return 'Sign in to follow people.';
    if (key === 'selfFollow') return "You can't follow yourself.";
    return key;
  },
}));

describe('useFollowUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuthStore.mockReturnValue({ currentUserPubky: 'current-user' });
    mockCommitFollow.mockResolvedValue(undefined);
    mockGetDetails.mockResolvedValue(null);
  });

  it('sets error when user not authenticated', async () => {
    mockUseAuthStore.mockReturnValue({ currentUserPubky: null });

    const { result } = renderHook(() => useFollowUser());

    await act(async () => {
      await result.current.toggleFollow('user-1', false);
    });

    expect(result.current.error).toBe('Sign in to follow people.');
    expect(mockCommitFollow).not.toHaveBeenCalled();
    expect(mockToast).not.toHaveBeenCalled();
  });

  it('sets error when following self', async () => {
    const { result } = renderHook(() => useFollowUser());

    await act(async () => {
      await result.current.toggleFollow('current-user', false);
    });

    expect(result.current.error).toBe("You can't follow yourself.");
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
      title: "You're now following Alice",
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
      title: "You're no longer following Alice",
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
      title: "You're now following Bob",
    });
  });

  it('shows error toast and rethrows on failure', async () => {
    const error = new Error('Follow failed');
    mockCommitFollow.mockRejectedValue(error);

    const { result } = renderHook(() => useFollowUser());

    await act(async () => {
      try {
        await result.current.toggleFollow('user-1', false, 'Alice');
      } catch {
        // swallow to allow state update assertions
      }
    });

    await waitFor(() => {
      expect(result.current.error).toBe('Could not follow Alice. Please try again.');
    });
    expect(mockToast).toHaveBeenCalledWith({
      variant: 'error',
      description: 'Could not follow Alice. Please try again.',
    });
    expect(mockLogger.error).toHaveBeenCalledWith('[useFollowUser] Failed to toggle follow:', error);
  });
});
