import { act, renderHook, waitFor } from '@testing-library/react';
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
