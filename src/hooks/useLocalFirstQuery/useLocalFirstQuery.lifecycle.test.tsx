import { act, renderHook, waitFor } from '@testing-library/react';
import Dexie from 'dexie';
import { describe, expect, it, vi } from 'vitest';
import { useLocalFirstQuery } from './useLocalFirstQuery';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}

describe('useLocalFirstQuery with real Dexie subscriptions', () => {
  it('keeps every cache-miss render loading until its fetch settles, including after a later deletion', async () => {
    const db = new Dexie('local-first-loading-lifecycle');
    db.version(1).stores({ entries: 'id' });
    const entries = db.table<{ id: string }, string>('entries');
    const pending = Promise.withResolvers<void>();
    const fetch = vi.fn().mockResolvedValueOnce(undefined).mockReturnValue(pending.promise);
    const missingFrames: boolean[] = [];
    const { result, unmount } = renderHook(() => {
      const value = useLocalFirstQuery({
        queryFn: async () => (await entries.get('post')) ?? null,
        fetchFn: fetch,
        deps: ['post'],
      });
      if (value.data === null) missingFrames.push(value.isLoading);
      return value;
    });
    try {
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(fetch).toHaveBeenCalledOnce();
      expect(missingFrames[0]).toBe(true);
      await act(async () => {
        await entries.put({ id: 'post' });
      });
      await waitFor(() => expect(result.current.data).toEqual({ id: 'post' }));
      missingFrames.length = 0;
      await act(async () => {
        await entries.delete('post');
      });
      await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
      expect(missingFrames.length).toBeGreaterThan(0);
      expect(missingFrames.every(Boolean)).toBe(true);
      await act(async () => pending.resolve());
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.data).toBeNull();
    } finally {
      pending.resolve();
      unmount();
      await db.delete();
    }
  });

  it('does not let an old fetch settle a newer cache miss', async () => {
    const old = Promise.withResolvers<void>();
    const current = Promise.withResolvers<void>();
    const fetch = vi.fn((id: string) => (id === 'old' ? old.promise : current.promise));
    const { result, rerender } = renderHook(
      ({ id }) => useLocalFirstQuery({ queryFn: async () => null, fetchFn: () => fetch(id), deps: [id] }),
      { initialProps: { id: 'old' } },
    );
    await waitFor(() => expect(fetch).toHaveBeenCalledExactlyOnceWith('old'));
    rerender({ id: 'current' });
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    await act(async () => old.resolve());
    expect(result.current.isLoading).toBe(true);
    await act(async () => current.resolve());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
  });

  it.each([null, { id: 'old' }])('waits for the new local read after a previous snapshot of %j', async (previous) => {
    const pending = deferred<{ id: string } | null>();
    const read = vi.fn((id: string) => (id === 'old' ? Promise.resolve(previous) : pending.promise));
    const fetch = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook(
      ({ id }) =>
        useLocalFirstQuery({
          queryFn: () => read(id),
          fetchFn: () => fetch(id),
          deps: [id],
        }),
      { initialProps: { id: 'old' } },
    );
    await waitFor(() => expect(result.current.data).toEqual(previous));
    if (previous === null) await waitFor(() => expect(result.current.isLoading).toBe(false));
    fetch.mockClear();

    rerender({ id: 'new' });
    await waitFor(() => expect(read).toHaveBeenCalledWith('new'));
    expect(result.current.data).toBeUndefined();
    expect(result.current.isLoading).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
    await act(async () => {
      pending.resolve({ id: 'new' });
    });
    await waitFor(() => expect(result.current.data).toEqual({ id: 'new' }));
    expect(fetch).not.toHaveBeenCalled();
  });

  it('fetches once when the current local read settles missing', async () => {
    const pending = deferred<{ id: string } | null>();
    const read = vi.fn().mockResolvedValueOnce({ id: 'old' }).mockReturnValue(pending.promise);
    const fetch = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook(
      ({ id }) => useLocalFirstQuery({ queryFn: read, fetchFn: () => fetch(id), deps: [id] }),
      { initialProps: { id: 'old' } },
    );
    await waitFor(() => expect(result.current.data).toEqual({ id: 'old' }));
    rerender({ id: 'new' });
    await waitFor(() => expect(read).toHaveBeenCalledTimes(2));
    expect(fetch).not.toHaveBeenCalled();
    await act(async () => {
      pending.resolve(null);
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toBeNull();
    expect(fetch).toHaveBeenCalledExactlyOnceWith('new');
  });

  it('ignores an old read that settles after the new read', async () => {
    const pending = deferred<{ id: string } | null>();
    const read = vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValue({ id: 'new' });
    const fetch = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook(
      ({ id }) => useLocalFirstQuery({ queryFn: read, fetchFn: fetch, deps: [id] }),
      { initialProps: { id: 'old' } },
    );
    await waitFor(() => expect(read).toHaveBeenCalled());
    rerender({ id: 'new' });
    await waitFor(() => expect(result.current.data).toEqual({ id: 'new' }));
    await act(async () => {
      pending.resolve(null);
    });
    expect(result.current.data).toEqual({ id: 'new' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('waits for a fresh read after returning to the same key', async () => {
    const pending = deferred<{ id: string } | null>();
    const read = vi.fn().mockResolvedValueOnce({ id: 'first' }).mockReturnValue(pending.promise);
    const fetch = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook(
      ({ id }) => useLocalFirstQuery({ queryFn: read, fetchFn: fetch, deps: [id] }),
      { initialProps: { id: 'first' } },
    );
    await waitFor(() => expect(result.current.data).toEqual({ id: 'first' }));
    rerender({ id: 'second' });
    await waitFor(() => expect(read).toHaveBeenCalledTimes(2));
    rerender({ id: 'first' });
    await waitFor(() => expect(read).toHaveBeenCalledTimes(3));
    expect(result.current.data).toBeUndefined();
    await act(async () => {
      pending.resolve({ id: 'fresh' });
    });
    await waitFor(() => expect(result.current.data).toEqual({ id: 'fresh' }));
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not reuse a cached snapshot after disabling and re-enabling', async () => {
    const pending = deferred<{ id: string } | null>();
    const read = vi.fn().mockResolvedValueOnce({ id: 'old' }).mockReturnValue(pending.promise);
    const fetch = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook(
      ({ enabled }) => useLocalFirstQuery({ queryFn: read, fetchFn: fetch, deps: ['same'], enabled }),
      { initialProps: { enabled: true } },
    );
    await waitFor(() => expect(result.current.data).toEqual({ id: 'old' }));
    rerender({ enabled: false });
    await waitFor(() => expect(result.current.data).toBeNull());
    rerender({ enabled: true });
    await waitFor(() => expect(read).toHaveBeenCalledTimes(2));
    expect(result.current.data).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
    await act(async () => {
      pending.resolve({ id: 'fresh' });
    });
    await waitFor(() => expect(result.current.data).toEqual({ id: 'fresh' }));
    expect(fetch).not.toHaveBeenCalled();
  });
});
