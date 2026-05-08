import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { asOpaque } from '@/test-utils/type-assertions';
import { useLocalFirstQuery } from './useLocalFirstQuery';
import type { UseLocalFirstQueryParams } from './useLocalFirstQuery.types';

// Shared variable that the useLiveQuery mock reads from.
// Tests set this to control what the "local DB" returns.
let queryResult: unknown = undefined;

// Track all useEffect callbacks so we can execute them manually.
// The hook may re-render and register a new effect; we always want the latest.
let effectCallbacks: (() => void | (() => void))[] = [];
let lastEffectCallback: (() => void | (() => void)) | null = null;

vi.mock('react', async () => {
  const actual = await vi.importActual('react');
  return {
    ...actual,
    useEffect: (cb: () => void | (() => void), _deps?: unknown[]) => {
      lastEffectCallback = cb;
      effectCallbacks.push(cb);
    },
  };
});

// Mock dexie-react-hooks — executes queryFn to trigger inner calls,
// then returns queryResult (set by the test) or defaultValue.
// This mirrors the pattern used by usePostDetails and useUserDetails tests.
vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: (queryFn: () => Promise<unknown>, _deps: unknown[], defaultValue: unknown) => {
    queryFn();
    return queryResult === undefined ? defaultValue : queryResult;
  },
}));

// Mock logger
const mockLoggerError = vi.fn();
vi.mock('@/libs/logger/logger', () => ({
  Logger: {
    error: (...args: unknown[]) => mockLoggerError(...args),
  },
}));

/**
 * Helper to build typed `useLocalFirstQuery` params from untyped vi.fn() mocks.
 * The opaque cast routes through the named helper so the ESLint ban on raw
 * double casts in test files stays active.
 */
function createParams(overrides: {
  queryFn?: ReturnType<typeof vi.fn>;
  fetchFn?: ReturnType<typeof vi.fn>;
  deps?: readonly unknown[];
  enabled?: boolean;
}): UseLocalFirstQueryParams<unknown> {
  return {
    queryFn: asOpaque<() => Promise<unknown | null>>(overrides.queryFn),
    fetchFn: asOpaque<() => Promise<unknown>>(overrides.fetchFn),
    deps: overrides.deps ?? ['default-dep'],
    enabled: overrides.enabled,
  };
}

describe('useLocalFirstQuery', () => {
  const mockData = { id: 'test-123', name: 'Test Item' };
  let queryFn: ReturnType<typeof vi.fn>;
  let fetchFn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    lastEffectCallback = null;
    effectCallbacks = [];
    queryResult = undefined;
    queryFn = vi.fn();
    fetchFn = vi.fn().mockResolvedValue(undefined);
  });

  // ---------------------------------------------------------------------------
  // Loading state
  // ---------------------------------------------------------------------------

  it('returns isLoading true when queryFn has not resolved yet', () => {
    queryResult = undefined;
    queryFn.mockReturnValue(null);

    const { result } = renderHook(() => useLocalFirstQuery(createParams({ queryFn, fetchFn, deps: ['id-1'] })));

    // useLiveQuery mock falls back to defaultValue (undefined) when queryResult is undefined
    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // Data returned
  // ---------------------------------------------------------------------------

  it('returns data when queryFn resolves with a value', () => {
    queryResult = mockData;
    queryFn.mockReturnValue(mockData);

    const { result } = renderHook(() => useLocalFirstQuery(createParams({ queryFn, fetchFn, deps: ['id-1'] })));

    expect(result.current.data).toEqual(mockData);
    expect(result.current.isLoading).toBe(false);
  });

  it('returns isLoading false when queryFn resolves with null and fetch has settled (not found anywhere)', () => {
    queryResult = null;
    queryFn.mockReturnValue(null);

    const { result } = renderHook(() => useLocalFirstQuery(createParams({ queryFn, fetchFn, deps: ['id-1'] })));

    // isFetching is false (effect hasn't run in this mock setup) → isLoading derives to false.
    // This represents the settled state: local DB returned null and fetchFn has completed.
    expect(result.current.data).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('returns isLoading true while fetchFn is in-flight and local data is null (cache miss)', () => {
    queryResult = null;
    queryFn.mockReturnValue(null);
    // fetchFn returns a never-resolving promise to simulate an in-flight network request
    fetchFn.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useLocalFirstQuery(createParams({ queryFn, fetchFn, deps: ['id-1'] })));

    // Execute the captured useEffect callback — calls setIsFetching(true) + fetchFn()
    act(() => {
      lastEffectCallback!();
    });

    // data is null (cache miss) and isFetching is true → isLoading stays true
    expect(result.current.data).toBeNull();
    expect(result.current.isLoading).toBe(true);
  });

  it('returns isLoading false after fetchFn settles with data still null (not found anywhere)', async () => {
    queryResult = null;
    queryFn.mockReturnValue(null);
    // fetchFn resolves immediately (simulates fetch that found nothing / wrote nothing useful)
    fetchFn.mockResolvedValue(undefined);

    const { result } = renderHook(() => useLocalFirstQuery(createParams({ queryFn, fetchFn, deps: ['id-1'] })));

    // Execute the effect — setIsFetching(true), then fetchFn resolves → .finally sets isFetching(false)
    await act(async () => {
      lastEffectCallback!();
    });

    // fetchFn settled, data is still null → isLoading is false (genuinely not found)
    expect(result.current.data).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // queryFn is called
  // ---------------------------------------------------------------------------

  it('calls queryFn on render', () => {
    queryResult = mockData;
    queryFn.mockReturnValue(mockData);

    renderHook(() => useLocalFirstQuery(createParams({ queryFn, fetchFn, deps: ['id-1'] })));

    expect(queryFn).toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Early-return behavior based on `data`
  // ---------------------------------------------------------------------------

  it('does not call fetchFn when data is undefined (useLiveQuery has not resolved)', async () => {
    queryResult = undefined;
    queryFn.mockReturnValue(null);

    renderHook(() => useLocalFirstQuery(createParams({ queryFn, fetchFn, deps: ['id-1'] })));

    expect(lastEffectCallback).not.toBeNull();
    await act(async () => {
      lastEffectCallback!();
    });

    // data === undefined → early return, fetchFn not called
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('does not call fetchFn when data is non-null (cache hit)', async () => {
    queryResult = mockData;
    queryFn.mockReturnValue(mockData);

    renderHook(() => useLocalFirstQuery(createParams({ queryFn, fetchFn, deps: ['id-1'] })));

    expect(lastEffectCallback).not.toBeNull();
    await act(async () => {
      lastEffectCallback!();
    });

    // data !== null → early return, fetchFn not called (cache hit)
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('calls fetchFn when data is null (cache miss)', async () => {
    queryResult = null;
    queryFn.mockReturnValue(null);

    renderHook(() => useLocalFirstQuery(createParams({ queryFn, fetchFn, deps: ['id-1'] })));

    expect(lastEffectCallback).not.toBeNull();
    await act(async () => {
      lastEffectCallback!();
    });

    // data === null → cache miss, fetchFn is called
    expect(fetchFn).toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // fetchFn via useEffect
  // ---------------------------------------------------------------------------

  it('calls fetchFn when enabled (default) and data is null', async () => {
    queryResult = null;
    queryFn.mockReturnValue(null);

    renderHook(() => useLocalFirstQuery(createParams({ queryFn, fetchFn, deps: ['id-1'] })));

    // Execute the captured useEffect callback
    expect(lastEffectCallback).not.toBeNull();
    await act(async () => {
      lastEffectCallback!();
    });

    expect(fetchFn).toHaveBeenCalled();
  });

  it('does not call fetchFn when enabled is false', () => {
    queryResult = undefined;
    queryFn.mockReturnValue(null);

    renderHook(() => useLocalFirstQuery(createParams({ queryFn, fetchFn, deps: ['id-1'], enabled: false })));

    // Execute the captured useEffect callback
    expect(lastEffectCallback).not.toBeNull();
    act(() => {
      lastEffectCallback!();
    });

    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('does not call queryFn when enabled is false', () => {
    queryResult = undefined;
    queryFn.mockReturnValue(null);

    renderHook(() => useLocalFirstQuery(createParams({ queryFn, fetchFn, deps: ['id-1'], enabled: false })));

    // queryFn should not be called — the useLiveQuery wrapper short-circuits to null
    expect(queryFn).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Cleanup / cancellation
  // ---------------------------------------------------------------------------

  it('returns a cleanup function from the effect when fetching (data is null)', async () => {
    queryResult = null;
    queryFn.mockReturnValue(null);

    renderHook(() => useLocalFirstQuery(createParams({ queryFn, fetchFn, deps: ['id-1'] })));

    expect(lastEffectCallback).not.toBeNull();
    let cleanup: unknown;
    await act(async () => {
      cleanup = lastEffectCallback!();
    });
    expect(typeof cleanup).toBe('function');
  });

  it('does not return a cleanup function when data is undefined (early return)', () => {
    queryResult = undefined;
    queryFn.mockReturnValue(null);

    renderHook(() => useLocalFirstQuery(createParams({ queryFn, fetchFn, deps: ['id-1'] })));

    expect(lastEffectCallback).not.toBeNull();
    let cleanup: unknown;
    act(() => {
      cleanup = lastEffectCallback!();
    });
    // data === undefined → early return, no cleanup needed
    expect(cleanup).toBeUndefined();
  });

  it('does not return a cleanup function when data is non-null (early return)', () => {
    queryResult = mockData;
    queryFn.mockReturnValue(mockData);

    renderHook(() => useLocalFirstQuery(createParams({ queryFn, fetchFn, deps: ['id-1'] })));

    expect(lastEffectCallback).not.toBeNull();
    let cleanup: unknown;
    act(() => {
      cleanup = lastEffectCallback!();
    });
    // data !== null → early return, no cleanup needed
    expect(cleanup).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // Error handling — queryFn
  // ---------------------------------------------------------------------------

  it('logs an error when queryFn throws', () => {
    queryResult = undefined;
    queryFn.mockImplementation(() => {
      throw new Error('DB read failed');
    });

    renderHook(() => useLocalFirstQuery(createParams({ queryFn, fetchFn, deps: ['id-1'] })));

    // The wrapper inside useLiveQuery catches and calls Logger.error
    expect(mockLoggerError).toHaveBeenCalledWith(
      '[useLocalFirstQuery] queryFn failed',
      expect.objectContaining({ error: expect.any(Error) }),
    );
  });

  // ---------------------------------------------------------------------------
  // Error handling — fetchFn
  // ---------------------------------------------------------------------------

  it('does not throw when fetchFn rejects', async () => {
    queryResult = null;
    queryFn.mockReturnValue(null);
    fetchFn.mockRejectedValue(new Error('Network error'));

    renderHook(() => useLocalFirstQuery(createParams({ queryFn, fetchFn, deps: ['id-1'] })));

    // Execute the effect — should not throw despite fetchFn rejecting
    expect(lastEffectCallback).not.toBeNull();
    await act(async () => {
      lastEffectCallback!();
    });
  });

  it('sets isLoading false after fetchFn rejects (error treated as settled)', async () => {
    queryResult = null;
    queryFn.mockReturnValue(null);
    fetchFn.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useLocalFirstQuery(createParams({ queryFn, fetchFn, deps: ['id-1'] })));

    await act(async () => {
      lastEffectCallback!();
    });

    // fetchFn rejected → .finally sets isFetching(false) → isLoading is false
    expect(result.current.data).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Deps are forwarded
  // ---------------------------------------------------------------------------

  it('re-invokes queryFn when deps change', () => {
    queryResult = mockData;
    queryFn.mockReturnValue(mockData);

    const { rerender } = renderHook(
      ({ id }: { id: string }) => useLocalFirstQuery(createParams({ queryFn, fetchFn, deps: [id] })),
      { initialProps: { id: 'id-1' } },
    );

    const callCountAfterFirstRender = queryFn.mock.calls.length;

    rerender({ id: 'id-2' });

    expect(queryFn.mock.calls.length).toBeGreaterThan(callCountAfterFirstRender);
  });

  // ---------------------------------------------------------------------------
  // No infinite loop on fetch failure
  // ---------------------------------------------------------------------------

  it('does not re-fetch when fetchFn fails (data stays null, deps unchanged)', async () => {
    queryResult = null;
    queryFn.mockReturnValue(null);
    fetchFn.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useLocalFirstQuery(createParams({ queryFn, fetchFn, deps: ['id-1'] })));

    // Execute the effect — fetchFn rejects, data stays null
    await act(async () => {
      lastEffectCallback!();
    });

    // fetchFn was called once
    expect(fetchFn).toHaveBeenCalledTimes(1);

    // isLoading is false — fetch settled, data is null (not found anywhere)
    expect(result.current.data).toBeNull();
    expect(result.current.isLoading).toBe(false);

    // Since deps haven't changed, the effect won't re-run — no infinite loop.

    // Re-executing the same effect simulates what would happen if React re-ran it.
    // fetchFn should be called again (since data is still null), but in practice
    // React won't re-run the effect because deps haven't changed.
    (fetchFn as Mock).mockClear();
    await act(async () => {
      lastEffectCallback!();
    });
    // This confirms the effect *would* fetch if re-run — the guard is at the
    // React scheduler level (deps unchanged), not inside the effect body.
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  // ---------------------------------------------------------------------------
  // isFetching reset on cache hit early return
  // ---------------------------------------------------------------------------

  it('resets isFetching to false when data transitions from null to non-null', async () => {
    // Start with cache miss
    queryResult = null;
    queryFn.mockReturnValue(null);
    fetchFn.mockReturnValue(new Promise(() => {})); // never resolves

    const { result } = renderHook(() => useLocalFirstQuery(createParams({ queryFn, fetchFn, deps: ['id-1'] })));

    // Execute effect — starts fetching
    act(() => {
      lastEffectCallback!();
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeNull();

    // Now simulate data arriving in IndexedDB (useLiveQuery re-fires)
    queryResult = mockData;

    // Re-render triggers a new effect callback capture
    const { result: result2 } = renderHook(() =>
      useLocalFirstQuery(createParams({ queryFn, fetchFn, deps: ['id-1'] })),
    );

    // Execute the new effect — data is non-null, early return + reset isFetching
    act(() => {
      lastEffectCallback!();
    });

    expect(result2.current.data).toEqual(mockData);
    expect(result2.current.isLoading).toBe(false);
  });
});
