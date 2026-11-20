import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { usePinakesQuery } from './usePinakesQuery';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('usePinakesQuery', () => {
  it('is loading until the read settles, then returns the answer', async () => {
    const read = deferred<string>();
    const fetchFn = vi.fn(() => read.promise);

    const { result } = renderHook(() => usePinakesQuery({ key: 'a', fetchFn, enabled: true }));

    expect(result.current).toEqual({ data: undefined, isLoading: true, isError: false });
    read.resolve('card');
    await waitFor(() => expect(result.current).toEqual({ data: 'card', isLoading: false, isError: false }));
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('settles on null when the read answers nothing', async () => {
    const { result } = renderHook(() =>
      usePinakesQuery<string>({ key: 'a', fetchFn: () => Promise.resolve(null), enabled: true }),
    );

    await waitFor(() => expect(result.current).toEqual({ data: null, isLoading: false, isError: false }));
  });

  it('settles on an error state when the read fails', async () => {
    const { result } = renderHook(() =>
      usePinakesQuery<string>({ key: 'a', fetchFn: () => Promise.reject(new Error('boom')), enabled: true }),
    );

    await waitFor(() => expect(result.current).toEqual({ data: null, isLoading: false, isError: true }));
  });

  it('makes no request and settles on null when disabled', () => {
    const fetchFn = vi.fn(() => Promise.resolve('card'));

    const { result } = renderHook(() => usePinakesQuery({ key: 'a', fetchFn, enabled: false }));

    expect(result.current).toEqual({ data: null, isLoading: false, isError: false });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('never shows the answer for an older key', async () => {
    const reads: Record<string, ReturnType<typeof deferred<string>>> = { a: deferred(), b: deferred() };
    const { result, rerender } = renderHook(
      ({ key }) => usePinakesQuery({ key, fetchFn: () => reads[key].promise, enabled: true }),
      { initialProps: { key: 'a' } },
    );

    rerender({ key: 'b' });
    expect(result.current.isLoading).toBe(true);
    reads.a.resolve('old');
    await act(async () => {});

    expect(result.current).toEqual({ data: undefined, isLoading: true, isError: false });
    reads.b.resolve('new');
    await waitFor(() => expect(result.current.data).toBe('new'));
  });

  it('reads again for a new key instead of keeping the previous answer', async () => {
    const { result, rerender } = renderHook(
      ({ key }) => usePinakesQuery({ key, fetchFn: () => Promise.resolve(`card ${key}`), enabled: true }),
      { initialProps: { key: 'a' } },
    );
    await waitFor(() => expect(result.current.data).toBe('card a'));

    rerender({ key: 'b' });

    expect(result.current).toEqual({ data: undefined, isLoading: true, isError: false });
    await waitFor(() => expect(result.current.data).toBe('card b'));
  });
});
