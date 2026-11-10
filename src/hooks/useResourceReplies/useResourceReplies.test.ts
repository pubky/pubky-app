import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useResourceReplies } from './useResourceReplies';

const URI = 'https://example.com/article';

const mocks = vi.hoisted(() => ({
  counts: undefined as undefined | null | { resourceId: string; resourceIds?: string[]; replies?: number },
  muted: new Set<string>(),
  fetchReplies: vi.fn(),
}));

vi.mock('@/hooks/useResourceCounts/useResourceCounts', () => ({ useResourceCounts: () => mocks.counts }));
vi.mock('@/hooks/useMutedUsers/useMutedUsers', () => ({ useMutedUsers: () => ({ mutedUserIdSet: mocks.muted }) }));
vi.mock('@/controllers/resource/resource', () => ({ ResourceController: { fetchReplies: mocks.fetchReplies } }));

describe('useResourceReplies', () => {
  beforeEach(() => {
    mocks.fetchReplies.mockReset();
    mocks.counts = { resourceId: 'r1', replies: 5 };
    mocks.muted = new Set();
    useAuthStore.setState({ currentUserPubky: 'viewer' });
  });

  it('reads the newest few and shows them oldest first, with the rest behind "more"', async () => {
    mocks.fetchReplies.mockResolvedValue({ replyIds: ['u:5', 'u:4', 'u:3'], fetched: 3, reachedEnd: false });

    const { result } = renderHook(() => useResourceReplies(URI));

    await waitFor(() => expect(result.current.replyIds).toEqual(['u:3', 'u:4', 'u:5']));
    expect(mocks.fetchReplies).toHaveBeenCalledWith({ resourceId: 'r1', skip: 0, limit: 3 });
    expect(result.current.totalCount).toBe(5);
    expect(result.current.hasMore).toBe(true);
  });

  it('reads every page on "show all"', async () => {
    mocks.fetchReplies
      .mockResolvedValueOnce({ replyIds: ['u:5', 'u:4', 'u:3'], fetched: 3, reachedEnd: false })
      .mockResolvedValueOnce({ replyIds: ['u:5', 'u:4', 'u:3', 'u:2', 'u:1'], fetched: 5, reachedEnd: true });
    const { result } = renderHook(() => useResourceReplies(URI));
    await waitFor(() => expect(result.current.replyIds).toHaveLength(3));

    await act(() => result.current.expandAll());

    expect(result.current.replyIds).toEqual(['u:1', 'u:2', 'u:3', 'u:4', 'u:5']);
    expect(result.current.hasMore).toBe(false);
    expect(mocks.fetchReplies).toHaveBeenLastCalledWith(expect.objectContaining({ resourceId: 'r1', skip: 0 }));
  });

  it('reads the replies to each spelling of the link as one thread, by when they were written', async () => {
    mocks.counts = { resourceId: 'r1', resourceIds: ['r1', 'r2'], replies: 4 };
    // Post ids are TimestampIds: they sort as text by when the post was written.
    mocks.fetchReplies.mockImplementation(async ({ resourceId }: { resourceId: string }) =>
      resourceId === 'r1'
        ? { replyIds: ['a:0000000000004', 'a:0000000000001'], fetched: 2, reachedEnd: true }
        : { replyIds: ['b:0000000000003', 'b:0000000000002'], fetched: 2, reachedEnd: true },
    );

    const { result } = renderHook(() => useResourceReplies(URI, { maxReplies: 10 }));

    await waitFor(() =>
      expect(result.current.replyIds).toEqual([
        'a:0000000000001',
        'b:0000000000002',
        'b:0000000000003',
        'a:0000000000004',
      ]),
    );
    expect(mocks.fetchReplies).toHaveBeenCalledWith({ resourceId: 'r2', skip: 0, limit: 10 });
    expect(result.current.totalCount).toBe(4);
    expect(result.current.hasMore).toBe(false);
  });

  it('keeps the thread and the viewer’s reply while a spelling’s counts arrive after the link’s', async () => {
    mocks.counts = { resourceId: 'r1', replies: 1 };
    mocks.fetchReplies.mockImplementation(async ({ resourceId }: { resourceId: string }) =>
      resourceId === 'r1'
        ? { replyIds: ['a:0000000000001'], fetched: 1, reachedEnd: true }
        : { replyIds: ['b:0000000000002'], fetched: 1, reachedEnd: true },
    );
    const { result, rerender } = renderHook(() => useResourceReplies(URI));
    await waitFor(() => expect(result.current.replyIds).toEqual(['a:0000000000001']));
    act(() => result.current.addReply('me:0000000000009'));

    mocks.counts = { resourceId: 'r1', resourceIds: ['r1', 'r2'], replies: 2 };
    rerender();
    expect(result.current.replyIds).toEqual(['a:0000000000001', 'me:0000000000009']);

    await waitFor(() =>
      expect(result.current.replyIds).toEqual(['a:0000000000001', 'b:0000000000002', 'me:0000000000009']),
    );
  });

  it('reads every page of every spelling on "show all"', async () => {
    mocks.counts = { resourceId: 'r1', resourceIds: ['r1', 'r2'], replies: 5 };
    mocks.fetchReplies.mockImplementation(async ({ resourceId, skip }: { resourceId: string; skip: number }) => {
      if (resourceId === 'r2') return { replyIds: ['b:0000000000003'], fetched: 1, reachedEnd: true };
      return skip === 0
        ? { replyIds: ['a:0000000000005', 'a:0000000000004'], fetched: 2, reachedEnd: false }
        : { replyIds: ['a:0000000000002', 'a:0000000000001'], fetched: 2, reachedEnd: true };
    });
    const { result } = renderHook(() => useResourceReplies(URI));
    await waitFor(() => expect(result.current.replyIds).toHaveLength(3));

    await act(() => result.current.expandAll());

    expect(result.current.replyIds).toEqual([
      'a:0000000000001',
      'a:0000000000002',
      'b:0000000000003',
      'a:0000000000004',
      'a:0000000000005',
    ]);
    expect(result.current.hasMore).toBe(false);
  });

  it('reads nothing while Nexus counts no reply or does not know the link', () => {
    mocks.counts = { resourceId: 'r1', replies: 0 };
    const { result, rerender } = renderHook(() => useResourceReplies(URI));
    expect(result.current.replyIds).toEqual([]);
    expect(result.current.hasMore).toBe(false);

    mocks.counts = null;
    rerender();
    expect(result.current.replyIds).toEqual([]);
    expect(mocks.fetchReplies).not.toHaveBeenCalled();
  });

  it('shows the viewer’s own reply at once, last, and counts it', async () => {
    mocks.counts = { resourceId: 'r1', replies: 1 };
    mocks.fetchReplies.mockResolvedValue({ replyIds: ['u:1'], fetched: 1, reachedEnd: true });
    const { result } = renderHook(() => useResourceReplies(URI));
    await waitFor(() => expect(result.current.replyIds).toEqual(['u:1']));

    act(() => result.current.addReply('me:2'));

    expect(result.current.replyIds).toEqual(['u:1', 'me:2']);
    expect(result.current.totalCount).toBe(2);
    expect(result.current.hasMore).toBe(false);
  });

  it('leaves out replies by muted users and does not count them', async () => {
    mocks.counts = { resourceId: 'r1', replies: 2 };
    mocks.muted = new Set(['m']);
    mocks.fetchReplies.mockResolvedValue({ replyIds: ['m:2', 'u:1'], fetched: 2, reachedEnd: true });

    const { result } = renderHook(() => useResourceReplies(URI));

    await waitFor(() => expect(result.current.replyIds).toEqual(['u:1']));
    expect(result.current.totalCount).toBe(1);
  });

  it('keeps the composer’s thread empty when the read fails', async () => {
    mocks.fetchReplies.mockRejectedValue(new Error('nexus down'));
    const { result } = renderHook(() => useResourceReplies(URI));

    await waitFor(() => expect(mocks.fetchReplies).toHaveBeenCalled());
    expect(result.current.replyIds).toEqual([]);
  });

  it('counts 0 when Nexus has no record of the link, none while read or when Nexus does not count replies', () => {
    mocks.counts = { resourceId: 'r1' };
    const { result, rerender } = renderHook(() => useResourceReplies(URI));
    expect(result.current.replyCount).toBeUndefined();
    expect(mocks.fetchReplies).not.toHaveBeenCalled();

    mocks.counts = null;
    rerender();
    expect(result.current.replyCount).toBe(0);

    mocks.counts = undefined;
    rerender();
    expect(result.current.replyCount).toBeUndefined();
  });

  it('counts the viewer’s own replies when Nexus does not count replies', () => {
    mocks.counts = { resourceId: 'r1' };
    const { result } = renderHook(() => useResourceReplies(URI));

    act(() => result.current.addReply('me:1'));

    expect(result.current.replyCount).toBe(1);
  });

  it('counts the viewer’s reply on top of the replies Nexus counts but did not list', async () => {
    mocks.fetchReplies.mockResolvedValue({ replyIds: ['u:5', 'u:4', 'u:3'], fetched: 3, reachedEnd: false });
    const { result } = renderHook(() => useResourceReplies(URI));
    await waitFor(() => expect(result.current.replyIds).toHaveLength(3));

    act(() => result.current.addReply('me:6'));

    expect(result.current.replyCount).toBe(6);
    expect(result.current.replyIds).toEqual(['u:3', 'u:4', 'u:5', 'me:6']);
    expect(result.current.hasMore).toBe(true);
  });

  it('drops "more" once "show all" read as many pages as it reads', async () => {
    mocks.counts = { resourceId: 'r1', replies: 10_000 };
    let next = 0;
    mocks.fetchReplies.mockImplementation(async ({ limit }: { limit: number }) => {
      const ids = Array.from({ length: limit }, () => `u:${next++}`);
      return { replyIds: ids, fetched: limit, reachedEnd: false };
    });
    const { result } = renderHook(() => useResourceReplies(URI));
    await waitFor(() => expect(result.current.replyIds).toHaveLength(3));

    await act(() => result.current.expandAll());

    expect(result.current.hasMore).toBe(false);
  });

  it('asks again when a page comes back for a session restored meanwhile (same viewer)', async () => {
    vi.useFakeTimers();
    try {
      mocks.fetchReplies.mockResolvedValueOnce(null).mockResolvedValue({
        replyIds: ['u:5', 'u:4', 'u:3'],
        fetched: 3,
        reachedEnd: false,
      });
      const { result } = renderHook(() => useResourceReplies(URI));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(result.current.replyIds).toEqual([]);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_000);
      });

      expect(mocks.fetchReplies).toHaveBeenCalledTimes(2);
      expect(result.current.replyIds).toEqual(['u:3', 'u:4', 'u:5']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not count the viewer’s reply twice once Nexus counts it', async () => {
    mocks.fetchReplies.mockResolvedValue({ replyIds: ['u:5', 'u:4', 'u:3'], fetched: 3, reachedEnd: false });
    const { result, rerender } = renderHook(() => useResourceReplies(URI));
    await waitFor(() => expect(result.current.replyIds).toHaveLength(3));
    act(() => result.current.addReply('me:6'));
    expect(result.current.replyCount).toBe(6);

    // A later read of the link's counts (a tag re-read) brings Nexus' count with the reply in it.
    mocks.counts = { resourceId: 'r1', replies: 6 };
    rerender();

    expect(result.current.replyCount).toBe(6);
  });

  it('pages "show all" by what Nexus sent, also when a reply was left out', async () => {
    mocks.fetchReplies
      .mockResolvedValueOnce({ replyIds: ['u:5', 'u:4', 'u:3'], fetched: 3, reachedEnd: false })
      // One reply of the 20 could not be stored: the next page still starts after all 20.
      .mockResolvedValueOnce({
        replyIds: Array.from({ length: 19 }, (_, i) => `u:${40 - i}`),
        fetched: 20,
        reachedEnd: false,
      })
      .mockResolvedValueOnce({ replyIds: ['u:2', 'u:1'], fetched: 2, reachedEnd: true });
    const { result } = renderHook(() => useResourceReplies(URI));
    await waitFor(() => expect(result.current.replyIds).toHaveLength(3));

    await act(() => result.current.expandAll());

    expect(mocks.fetchReplies).toHaveBeenLastCalledWith(expect.objectContaining({ skip: 20 }));
    expect(result.current.hasMore).toBe(false);
  });

  it('reads the replies again for another viewer, with nothing of the last viewer’s kept', async () => {
    mocks.fetchReplies.mockResolvedValue({ replyIds: ['u:5', 'u:4', 'u:3'], fetched: 3, reachedEnd: false });
    const { result } = renderHook(() => useResourceReplies(URI));
    await waitFor(() => expect(result.current.replyIds).toHaveLength(3));
    act(() => result.current.addReply('me:6'));

    act(() => useAuthStore.setState({ currentUserPubky: 'other' }));

    await waitFor(() => expect(mocks.fetchReplies).toHaveBeenCalledTimes(2));
    expect(result.current.replyIds).not.toContain('me:6');
  });
});
