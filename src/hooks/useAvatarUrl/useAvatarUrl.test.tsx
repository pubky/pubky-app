import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NexusUserDetails } from '@/services/nexus/nexus.types';
import { useAvatarUrl } from './useAvatarUrl';

// Mock file controller
const mockGetAvatarUrl = vi.fn();
vi.mock('@/controllers/file/file', () => ({
  FileController: {
    getAvatarUrl: (pubky: string) => mockGetAvatarUrl(pubky),
  },
}));

describe('useAvatarUrl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAvatarUrl.mockReturnValue('https://example.com/avatar/test-user.png');
  });

  it('returns avatar URL when user has an image', () => {
    const userDetails = {
      id: 'test-user',
      name: 'Test User',
      image: 'avatar.jpg',
    } as NexusUserDetails;

    const { result } = renderHook(() => useAvatarUrl(userDetails));

    expect(result.current).toBe('https://example.com/avatar/test-user.png');
    expect(mockGetAvatarUrl).toHaveBeenCalledWith('test-user');
  });

  it('returns undefined when user has no image', () => {
    const userDetails = {
      id: 'test-user',
      name: 'Test User',
      image: null,
    } as NexusUserDetails;

    const { result } = renderHook(() => useAvatarUrl(userDetails));

    expect(result.current).toBeUndefined();
    expect(mockGetAvatarUrl).not.toHaveBeenCalled();
  });

  it('returns undefined when user image is null', () => {
    const userDetails = {
      id: 'test-user',
      name: 'Test User',
      image: null,
    } as NexusUserDetails;

    const { result } = renderHook(() => useAvatarUrl(userDetails));

    expect(result.current).toBeUndefined();
    expect(mockGetAvatarUrl).not.toHaveBeenCalled();
  });

  it('returns undefined when userDetails is null', () => {
    const { result } = renderHook(() => useAvatarUrl(null));

    expect(result.current).toBeUndefined();
    expect(mockGetAvatarUrl).not.toHaveBeenCalled();
  });

  it('returns undefined when userDetails is undefined', () => {
    const { result } = renderHook(() => useAvatarUrl(undefined));

    expect(result.current).toBeUndefined();
    expect(mockGetAvatarUrl).not.toHaveBeenCalled();
  });

  it('memoizes avatar URL when userDetails object reference stays the same', () => {
    const userDetails = {
      id: 'test-user',
      name: 'Test User',
      image: 'avatar.jpg',
    } as NexusUserDetails;

    const { result, rerender } = renderHook(() => useAvatarUrl(userDetails));

    const firstResult = result.current;

    // Rerender with same object reference
    rerender();

    // Should return the same URL (memoized)
    expect(result.current).toBe(firstResult);
    // getAvatarUrl should only be called once (on first render)
    expect(mockGetAvatarUrl).toHaveBeenCalledTimes(1);
  });

  it('recomputes avatar URL when user id changes', () => {
    mockGetAvatarUrl.mockImplementation((pubky: string) => `https://example.com/avatar/${pubky}.png`);

    const userDetails1 = {
      id: 'user-1',
      name: 'User 1',
      image: 'avatar1.jpg',
    } as NexusUserDetails;

    const { result, rerender } = renderHook(({ userDetails }) => useAvatarUrl(userDetails), {
      initialProps: { userDetails: userDetails1 },
    });

    expect(result.current).toBe('https://example.com/avatar/user-1.png');

    const userDetails2 = {
      id: 'user-2',
      name: 'User 2',
      image: 'avatar2.jpg',
    } as NexusUserDetails;

    rerender({ userDetails: userDetails2 });

    expect(result.current).toBe('https://example.com/avatar/user-2.png');
    expect(mockGetAvatarUrl).toHaveBeenCalledTimes(2);
    expect(mockGetAvatarUrl).toHaveBeenCalledWith('user-1');
    expect(mockGetAvatarUrl).toHaveBeenCalledWith('user-2');
  });

  it('recomputes avatar URL when image changes from empty to present', () => {
    const userDetails1 = {
      id: 'test-user',
      name: 'Test User',
      image: null,
    } as NexusUserDetails;

    const { result, rerender } = renderHook(({ userDetails }) => useAvatarUrl(userDetails), {
      initialProps: { userDetails: userDetails1 },
    });

    expect(result.current).toBeUndefined();

    const userDetails2 = {
      id: 'test-user',
      name: 'Test User',
      image: 'avatar.jpg',
    } as NexusUserDetails;

    rerender({ userDetails: userDetails2 });

    expect(result.current).toBe('https://example.com/avatar/test-user.png');
    expect(mockGetAvatarUrl).toHaveBeenCalledTimes(1);
  });
});

describe('useAvatarUrl - Snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAvatarUrl.mockReturnValue('https://example.com/avatar/snapshot-user.png');
  });

  it('matches snapshot for user with image', () => {
    const userDetails = {
      id: 'snapshot-user',
      name: 'Snapshot User',
      image: 'avatar.jpg',
      bio: 'A user for snapshot testing',
    } as NexusUserDetails;

    const { result } = renderHook(() => useAvatarUrl(userDetails));

    expect(result.current).toMatchSnapshot();
  });

  it('matches snapshot for user without image', () => {
    const userDetails = {
      id: 'snapshot-user',
      name: 'Snapshot User',
      image: null,
    } as NexusUserDetails;

    const { result } = renderHook(() => useAvatarUrl(userDetails));

    expect(result.current).toMatchSnapshot();
  });

  it('matches snapshot for null userDetails', () => {
    const { result } = renderHook(() => useAvatarUrl(null));

    expect(result.current).toMatchSnapshot();
  });
});
