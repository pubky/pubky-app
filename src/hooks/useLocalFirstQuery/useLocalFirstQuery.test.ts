import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLocalFirstQuery } from './useLocalFirstQuery';
import type { UseLocalFirstQueryParams } from './useLocalFirstQuery.types';

// Shared variable that the useLiveQuery mock reads from.
// Tests set this to control what the "local DB" returns.
let queryResult: unknown = undefined;

// Track the last useEffect callback so we can execute it manually
let lastEffectCallback: (() => void | (() => void)) | null = null;

vi.mock('react', async () => {
  const actual = await vi.importActual('react');
  return {
    ...actual,
    useEffect: (cb: () => void | (() => void), _deps?: unknown[]) => {
      lastEffectCallback = cb;
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

// Mock @/libs
const mockLoggerError = vi.fn();
vi.mock('@/libs', () => ({
  Logger: {
    error: (...args: unknown[]) => mockLoggerError(...args),
  },
}));

/**
 * Helper to build typed `useLocalFirstQuery` params from untyped vi.fn() mocks.
 * Uses `as unknown as` cast — same pattern used throughout the test suite
 * (see useAuthUrl, useBookmark, useEmojiInsert tests).
 */
function createParams(overrides: {
  queryFn?: ReturnType<typeof vi.fn>;
  fetchFn?: ReturnType<typeof vi.fn>;
  deps?: readonly unknown[];
  enabled?: boolean;
}): UseLocalFirstQueryParams<unknown> {
  return {
    queryFn: overrides.queryFn as unknown as () => Promise<unknown | null>,
    fetchFn: overrides.fetchFn as unknown as () => Promise<unknown>,
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
  // fetchFn via useEffect
  // ---------------------------------------------------------------------------

  it('calls fetchFn when enabled (default)', async () => {
    queryResult = undefined;
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

  it('returns a cleanup function from the effect', async () => {
    queryResult = undefined;
    queryFn.mockReturnValue(null);

    renderHook(() => useLocalFirstQuery(createParams({ queryFn, fetchFn, deps: ['id-1'] })));

    expect(lastEffectCallback).not.toBeNull();
    let cleanup: unknown;
    await act(async () => {
      cleanup = lastEffectCallback!();
    });
    expect(typeof cleanup).toBe('function');
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
    queryResult = undefined;
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
});
