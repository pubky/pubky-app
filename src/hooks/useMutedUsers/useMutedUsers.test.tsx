import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMutedUsers } from './useMutedUsers';

const { mockUseLiveQuery } = vi.hoisted(() => ({
  mockUseLiveQuery: vi.fn(),
}));

// Mock dexie-react-hooks as it's a database connection dependency.
// Per testing guidelines, database connections should be mocked to avoid
// actual DB operations in unit tests.
vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: (...args: unknown[]) => mockUseLiveQuery(...args),
}));

describe('useMutedUsers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns loading state when stream is undefined', () => {
    mockUseLiveQuery.mockReturnValue(undefined);

    const { result } = renderHook(() => useMutedUsers());

    expect(result.current.isLoading).toBe(true);
    expect(result.current.mutedUserIds).toEqual([]);
    expect(result.current.isMuted('user-1')).toBe(false);
  });

  it('returns empty list when stream is null', () => {
    mockUseLiveQuery.mockReturnValue(null);

    const { result } = renderHook(() => useMutedUsers());

    expect(result.current.isLoading).toBe(false);
    expect(result.current.mutedUserIds).toEqual([]);
  });

  it('returns muted ids and isMuted lookup', () => {
    mockUseLiveQuery.mockReturnValue({ stream: ['user-1', 'user-2'] });

    const { result } = renderHook(() => useMutedUsers());

    expect(result.current.isLoading).toBe(false);
    expect(result.current.mutedUserIds).toEqual(['user-1', 'user-2']);
    expect(result.current.isMuted('user-1')).toBe(true);
    expect(result.current.isMuted('user-3')).toBe(false);
  });

  it('normalizes prefixed user IDs in isMuted lookup', () => {
    // Stored IDs are without prefix (normalized during mute)
    const rawPubky = '68rkfi1d78baobycj6w4b7dga43o8qtnuhubban5at6qywrieb5y';
    mockUseLiveQuery.mockReturnValue({ stream: [rawPubky] });

    const { result } = renderHook(() => useMutedUsers());

    // Should match regardless of prefix format
    // PUBKY_PREFIX is 'pubky' (no colon), LEGACY_PUBKY_PREFIX is 'pk:'
    expect(result.current.isMuted(rawPubky)).toBe(true);
    expect(result.current.isMuted(`pubky${rawPubky}`)).toBe(true);
    expect(result.current.isMuted(`pk:${rawPubky}`)).toBe(true);
  });
});
