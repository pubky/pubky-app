import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocksController } from '@/controllers/locks/locks';
import type { TUnlockedListItem } from '@/services/locks/locks.types';
import { useUnlockedList } from './useUnlockedList';

vi.mock('@/controllers/locks/locks', () => ({
  LocksController: { fetchUnlockedList: vi.fn().mockResolvedValue([]) },
}));
// Mutable so a test can sign the user out or hold the session restore; vi.hoisted beats the vi.mock
// hoist (plain const would be TDZ).
const authState = vi.hoisted(() => ({ currentUserPubky: 'me' as string | null, session: {} as object | null }));
vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (s: typeof authState) => unknown) => selector(authState),
}));

const item = (lockId: string, unlockedAt: number): TUnlockedListItem => ({
  lockId,
  post: { content: lockId, kind: 'short', attachments: null },
  unlockedAt,
});

describe('useUnlockedList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(LocksController.fetchUnlockedList).mockResolvedValue([]);
    authState.currentUserPubky = 'me';
    authState.session = {};
  });

  it('returns the items with their count', async () => {
    const items = [item('LOCK2', 2), item('LOCK1', 1)];
    vi.mocked(LocksController.fetchUnlockedList).mockResolvedValue(items);

    const { result } = renderHook(() => useUnlockedList());

    await waitFor(() => expect(result.current.count).toBe(2));
    expect(result.current.items).toEqual(items);
    expect(result.current.isLoading).toBe(false);
  });

  it('waits for the restored session before reading from /priv', async () => {
    // currentUserPubky is persisted and rehydrates first; reading now would hit /priv unauthenticated.
    authState.session = null;

    const { rerender, result } = renderHook(() => useUnlockedList());

    await Promise.resolve();
    expect(LocksController.fetchUnlockedList).not.toHaveBeenCalled();
    // Still loading, not a settled count of 0 — otherwise the sidebar flashes a wrong number.
    expect(result.current.isLoading).toBe(true);

    authState.session = {};
    rerender();

    await waitFor(() => expect(LocksController.fetchUnlockedList).toHaveBeenCalledTimes(1));
  });

  it("reads nothing when disabled (another user's profile has no /priv to read)", async () => {
    const { result } = renderHook(() => useUnlockedList({ enabled: false }));

    await Promise.resolve();
    expect(LocksController.fetchUnlockedList).not.toHaveBeenCalled();
    // Disabled is settled, not pending — the tab is hidden rather than showing a spinner.
    expect(result.current.isLoading).toBe(false);
  });

  it('reports isError on failure, so an empty list is not read as "nothing unlocked"', async () => {
    vi.mocked(LocksController.fetchUnlockedList).mockRejectedValue(new Error('offline'));

    const { result } = renderHook(() => useUnlockedList());

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.items).toEqual([]);
    expect(result.current.count).toBe(0);
    expect(result.current.isLoading).toBe(false);
  });

  it('clears the items when the session ends, so a signed-out profile shows nothing', async () => {
    vi.mocked(LocksController.fetchUnlockedList).mockResolvedValue([item('LOCK1', 1)]);

    const { result, rerender } = renderHook(() => useUnlockedList());
    await waitFor(() => expect(result.current.count).toBe(1));

    authState.session = null;
    rerender();

    expect(result.current.items).toEqual([]);
  });
});
