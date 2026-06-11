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
      expect(result.current.error).toBe('Could not update follow status');
    });
    expect(mockToast).toHaveBeenCalledWith({
      variant: 'error',
      description: 'Could not update follow status',
    });
    expect(mockLogger.error).toHaveBeenCalledWith('[useFollowUser] Failed to toggle follow:', error);
  });
});
