import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Logger } from '@/libs/logger/logger';
import { useBtcRate } from './useSatUsdRate';

const LAST_UPDATED_AT = '2026-09-18T00:00:00.000Z';
const VALID_BODY = { satUsd: 0.0005, btcUsd: 50_000, lastUpdatedAt: LAST_UPDATED_AT };

const mockResponse = (body: unknown, ok = true) => vi.fn().mockResolvedValue({ ok, json: () => Promise.resolve(body) });

describe('useBtcRate', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockResponse(VALID_BODY));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches the rate and rebuilds the date', async () => {
    const { result } = renderHook(() => useBtcRate());

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.rate).toEqual({
      satUsd: 0.0005,
      btcUsd: 50_000,
      lastUpdatedAt: new Date(LAST_UPDATED_AT),
    });
    expect(fetch).toHaveBeenCalledWith('/api/btc-rate');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('skips the request while disabled', () => {
    const { result } = renderHook(() => useBtcRate(false));

    expect(result.current).toEqual({ rate: null, status: 'loading' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('fetches once the caller enables it', async () => {
    const { result, rerender } = renderHook(({ enabled }) => useBtcRate(enabled), {
      initialProps: { enabled: false },
    });

    rerender({ enabled: true });

    await waitFor(() => expect(result.current.status).toBe('ready'));
  });

  it('ignores a response that lands after the caller disables the hook', async () => {
    let send: (body: unknown) => void = () => {};
    const body = new Promise((resolve) => {
      send = resolve;
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => body }));

    const { result, rerender } = renderHook(({ enabled }) => useBtcRate(enabled), {
      initialProps: { enabled: true },
    });
    rerender({ enabled: false });
    await act(async () => send(VALID_BODY));

    expect(result.current.status).toBe('loading');
  });

  it('keeps a rate it already has while a later request is in flight', async () => {
    const { result, rerender } = renderHook(({ enabled }) => useBtcRate(enabled), {
      initialProps: { enabled: true },
    });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    rerender({ enabled: false });
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})));
    rerender({ enabled: true });

    expect(result.current.status).toBe('ready');
    expect(result.current.rate).not.toBeNull();
  });

  it('clears an earlier failure while the retry is in flight', async () => {
    vi.stubGlobal('fetch', mockResponse({}, false));

    const { result, rerender } = renderHook(({ enabled }) => useBtcRate(enabled), {
      initialProps: { enabled: true },
    });
    await waitFor(() => expect(result.current.status).toBe('failed'));

    // A dialog that closes and reopens keeps this hook mounted, so the stale error would survive.
    rerender({ enabled: false });
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})));
    rerender({ enabled: true });

    expect(result.current.status).toBe('loading');
  });

  it('fails on a non-ok response', async () => {
    vi.stubGlobal('fetch', mockResponse({}, false));

    const { result } = renderHook(() => useBtcRate());

    await waitFor(() => expect(result.current.status).toBe('failed'));
    expect(result.current.rate).toBeNull();
  });

  it('logs a 2xx body that is not a rate', async () => {
    const logged = vi.spyOn(Logger, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', mockResponse({ satUsd: 'nope', btcUsd: 50_000, lastUpdatedAt: LAST_UPDATED_AT }));

    const { result } = renderHook(() => useBtcRate());

    await waitFor(() => expect(result.current.status).toBe('failed'));
    expect(logged).toHaveBeenCalledTimes(1);
    logged.mockRestore();
  });

  // A user's own bad network is not worth an entry; only a server-side change is.
  it('stays quiet when the request itself fails', async () => {
    const logged = vi.spyOn(Logger, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', mockResponse({}, false));

    const { result } = renderHook(() => useBtcRate());

    await waitFor(() => expect(result.current.status).toBe('failed'));
    expect(logged).not.toHaveBeenCalled();
    logged.mockRestore();
  });

  it.each([
    ['a missing satUsd', { btcUsd: 50_000, lastUpdatedAt: LAST_UPDATED_AT }],
    ['a non-numeric satUsd', { satUsd: 'nope', btcUsd: 50_000, lastUpdatedAt: LAST_UPDATED_AT }],
    ['a zero satUsd', { satUsd: 0, btcUsd: 50_000, lastUpdatedAt: LAST_UPDATED_AT }],
    ['an unparseable lastUpdatedAt', { satUsd: 0.0005, btcUsd: 50_000, lastUpdatedAt: 'never' }],
    ['a null lastUpdatedAt', { satUsd: 0.0005, btcUsd: 50_000, lastUpdatedAt: null }],
    ['a body that is not an object', 'service unavailable'],
  ])('fails on %s rather than reporting a rate', async (_label, body) => {
    vi.stubGlobal('fetch', mockResponse(body));

    const { result } = renderHook(() => useBtcRate());

    await waitFor(() => expect(result.current.status).toBe('failed'));
    expect(result.current.rate).toBeNull();
  });
});
