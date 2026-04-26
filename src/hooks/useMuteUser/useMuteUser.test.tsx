import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useMuteUser } from './useMuteUser';
import { HttpMethod } from '@/libs/http/http.types';

const { mockUseAuthStore, mockCommitMute, mockIsAppError, mockLogger } = vi.hoisted(() => ({
  mockUseAuthStore: vi.fn(),
  mockCommitMute: vi.fn(),
  mockIsAppError: vi.fn(),
  mockLogger: {
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/core', () => ({
  useAuthStore: () => mockUseAuthStore(),
  MuteController: {
    commitMute: (...args: unknown[]) => mockCommitMute(...args),
  },
}));

vi.mock('@/libs/logger/logger', () => ({
  Logger: mockLogger,
}));
vi.mock('@/libs/error/error.utils', () => ({
  isAppError: (...args: unknown[]) => mockIsAppError(...args),
}));

describe('useMuteUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsAppError.mockReturnValue(false);
    mockUseAuthStore.mockReturnValue({ currentUserPubky: 'current-user' });
  });

  it('sets error when user not authenticated', async () => {
    mockUseAuthStore.mockReturnValue({ currentUserPubky: null });

    const { result } = renderHook(() => useMuteUser());

    await act(async () => {
      await result.current.toggleMute('user-1', false);
    });

    expect(result.current.error).toBe('User not authenticated');
    expect(mockCommitMute).not.toHaveBeenCalled();
  });

  it('sets error when muting self', async () => {
    const { result } = renderHook(() => useMuteUser());

    await act(async () => {
      await result.current.toggleMute('current-user', false);
    });

    expect(result.current.error).toBe('Cannot mute yourself');
    expect(mockCommitMute).not.toHaveBeenCalled();
  });

  it('calls commitMute with PUT when muting', async () => {
    const { result } = renderHook(() => useMuteUser());

    await act(async () => {
      await result.current.toggleMute('user-1', false);
    });

    expect(mockCommitMute).toHaveBeenCalledWith(HttpMethod.PUT, { muter: 'current-user', mutee: 'user-1' });
  });

  it('calls commitMute with DELETE when unmuting', async () => {
    const { result } = renderHook(() => useMuteUser());

    await act(async () => {
      await result.current.toggleMute('user-1', true);
    });

    expect(mockCommitMute).toHaveBeenCalledWith(HttpMethod.DELETE, { muter: 'current-user', mutee: 'user-1' });
  });

  it('sets error and rethrows on failure', async () => {
    const error = new Error('boom');
    mockCommitMute.mockRejectedValue(error);
    mockIsAppError.mockReturnValue(true);

    const { result } = renderHook(() => useMuteUser());

    await act(async () => {
      try {
        await result.current.toggleMute('user-1', false);
      } catch {
        // swallow to allow state update assertions
      }
    });

    await waitFor(() => {
      expect(result.current.error).toBe('boom');
    });
  });
});
