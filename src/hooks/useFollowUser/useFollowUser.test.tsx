import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpMethod } from '@/libs/http/http.types';
import { toast } from '@/molecules/Toaster/toast';
import { useFollowUser } from './useFollowUser';

const { mockUseAuthStore, mockCommitFollow, mockLogger } = vi.hoisted(() => ({
  mockUseAuthStore: vi.fn(),
  mockCommitFollow: vi.fn(),
  mockLogger: {
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: () => mockUseAuthStore(),
}));

vi.mock('@/controllers/user/user', () => ({
  UserController: {
    commitFollow: (...args: unknown[]) => mockCommitFollow(...args),
  },
}));

vi.mock('@/libs/logger/logger', () => ({
  Logger: mockLogger,
}));

vi.mock('@/molecules/Toaster/toast');
describe('useFollowUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuthStore.mockReturnValue({ currentUserPubky: 'current-user' });
    mockCommitFollow.mockResolvedValue(undefined);
  });

  it('sets error when user not authenticated', async () => {
    mockUseAuthStore.mockReturnValue({ currentUserPubky: null });

    const { result } = renderHook(() => useFollowUser());

    await act(async () => {
      await result.current.toggleFollow('user-1', false);
    });

    expect(result.current.error).toBe('User not authenticated');
    expect(mockCommitFollow).not.toHaveBeenCalled();
    expect(vi.mocked(toast)).not.toHaveBeenCalled();
  });

  it('sets error when following self', async () => {
    const { result } = renderHook(() => useFollowUser());

    await act(async () => {
      await result.current.toggleFollow('current-user', false);
    });

    expect(result.current.error).toBe('Cannot follow yourself');
    expect(mockCommitFollow).not.toHaveBeenCalled();
  });

  it('shows a generic success toast on follow', async () => {
    const { result } = renderHook(() => useFollowUser());

    await act(async () => {
      await result.current.toggleFollow('user-1', false);
    });

    expect(mockCommitFollow).toHaveBeenCalledWith(HttpMethod.PUT, {
      follower: 'current-user',
      followee: 'user-1',
    });
    expect(vi.mocked(toast)).toHaveBeenCalledWith({
      title: 'User followed',
    });
  });

  it('shows a generic success toast on unfollow', async () => {
    const { result } = renderHook(() => useFollowUser());

    await act(async () => {
      await result.current.toggleFollow('user-1', true);
    });

    expect(mockCommitFollow).toHaveBeenCalledWith(HttpMethod.DELETE, {
      follower: 'current-user',
      followee: 'user-1',
    });
    expect(vi.mocked(toast)).toHaveBeenCalledWith({
      title: 'User unfollowed',
    });
  });

  it('shows a friendly generic error toast and resolves false when following fails', async () => {
    // A raw transport error must never reach the user.
    const error = new Error('Request failed: HTTP transport error: error sending request');
    mockCommitFollow.mockRejectedValue(error);

    const { result } = renderHook(() => useFollowUser());

    let returned: boolean | undefined;
    await act(async () => {
      returned = await result.current.toggleFollow('user-1', false);
    });

    expect(returned).toBe(false);
    await waitFor(() => {
      expect(result.current.error).toBe('Could not follow user. Try again.');
    });
    expect(vi.mocked(toast)).toHaveBeenCalledWith({
      variant: 'error',
      description: 'Could not follow user. Try again.',
    });
    expect(mockLogger.error).toHaveBeenCalledWith('[useFollowUser] Failed to toggle follow:', error);
  });

  it('shows the unfollow-specific friendly error when unfollowing fails', async () => {
    mockCommitFollow.mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() => useFollowUser());

    let returned: boolean | undefined;
    await act(async () => {
      returned = await result.current.toggleFollow('user-1', true);
    });

    expect(returned).toBe(false);
    expect(vi.mocked(toast)).toHaveBeenCalledWith({
      variant: 'error',
      description: 'Could not unfollow user. Try again.',
    });
  });
});
