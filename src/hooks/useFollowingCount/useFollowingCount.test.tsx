import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useFollowingCount } from './useFollowingCount';

const { mockUseLiveQuery, mockGetStreamUserIds, mockGetModerationId, mockLogger } = vi.hoisted(() => ({
  mockUseLiveQuery: vi.fn(),
  mockGetStreamUserIds: vi.fn(),
  mockGetModerationId: vi.fn(),
  mockLogger: { error: vi.fn() },
}));

let mockViewerId: string | null = 'viewer';

vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: (...args: unknown[]) => mockUseLiveQuery(...args),
}));

vi.mock('@/controllers/stream/users/users', () => ({
  StreamUserController: {
    getStreamUserIds: (...args: unknown[]) => mockGetStreamUserIds(...args),
  },
}));

vi.mock('@/config/moderation', () => ({
  getModerationId: () => mockGetModerationId(),
}));

vi.mock('@/libs/logger/logger', () => ({
  Logger: mockLogger,
}));

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (state: { currentUserPubky: string | null }) => unknown) =>
    selector({ currentUserPubky: mockViewerId }),
}));

/**
 * Runs the querier passed to useLiveQuery so the tests exercise the real read path, and exposes
 * what it resolved to. The hook itself keeps seeing `undefined` (still hydrating).
 */
function runQuerier() {
  const outcome: { settled?: unknown } = {};
  mockUseLiveQuery.mockImplementation((querier: () => Promise<unknown>) => {
    void querier().then((value) => {
      outcome.settled = value;
    });
    return undefined;
  });
  return outcome;
}

describe('useFollowingCount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockViewerId = 'viewer';
    mockGetModerationId.mockReturnValue('moderation-bot');
    mockGetStreamUserIds.mockResolvedValue([]);
  });

  it('reports loading until the live query settles', () => {
    mockUseLiveQuery.mockReturnValue(undefined);

    const { result } = renderHook(() => useFollowingCount());

    expect(result.current).toEqual({ followingCount: 0, isLoading: true });
  });

  it('counts the cached following stream minus the moderation bot', () => {
    mockUseLiveQuery.mockReturnValue(['user-1', 'moderation-bot', 'user-2']);

    const { result } = renderHook(() => useFollowingCount());

    expect(result.current).toEqual({ followingCount: 2, isLoading: false });
  });

  it('treats a never-cached stream as zero follows', () => {
    mockUseLiveQuery.mockReturnValue([]);

    const { result } = renderHook(() => useFollowingCount());

    expect(result.current).toEqual({ followingCount: 0, isLoading: false });
  });

  it('reads the viewer following stream through the controller', async () => {
    mockGetStreamUserIds.mockResolvedValue(['user-1']);
    runQuerier();

    renderHook(() => useFollowingCount());

    await waitFor(() => {
      expect(mockGetStreamUserIds).toHaveBeenCalledWith('viewer:following');
    });
  });

  it('does not read anything without a signed-in viewer', async () => {
    mockViewerId = null;
    const outcome = runQuerier();

    renderHook(() => useFollowingCount());

    await waitFor(() => {
      expect(outcome.settled).toEqual([]);
    });
    expect(mockGetStreamUserIds).not.toHaveBeenCalled();
  });

  it('logs and falls back to zero when the local read fails', async () => {
    const error = new Error('dexie closed');
    mockGetStreamUserIds.mockRejectedValue(error);
    const outcome = runQuerier();

    renderHook(() => useFollowingCount());

    await waitFor(() => {
      expect(outcome.settled).toEqual([]);
    });
    expect(mockLogger.error).toHaveBeenCalledWith('[useFollowingCount] Failed to read following stream', {
      streamId: 'viewer:following',
      error,
    });
  });
});
