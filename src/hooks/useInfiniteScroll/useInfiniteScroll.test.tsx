import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { asOpaque } from '@/test-utils/type-assertions';
import { useInfiniteScroll } from './useInfiniteScroll';

// Mock IntersectionObserver
const mockObserve = vi.fn();
const mockUnobserve = vi.fn();
const mockDisconnect = vi.fn();

// A plain function so `new IntersectionObserver(...)` can construct it.
const mockIntersectionObserver = vi.fn(function () {
  return {
    observe: mockObserve,
    unobserve: mockUnobserve,
    disconnect: mockDisconnect,
  };
});

// Make it available globally
Object.defineProperty(window, 'IntersectionObserver', {
  writable: true,
  configurable: true,
  value: mockIntersectionObserver,
});

Object.defineProperty(global, 'IntersectionObserver', {
  writable: true,
  configurable: true,
  value: mockIntersectionObserver,
});

describe('useInfiniteScroll', () => {
  let mockOnLoadMore: ReturnType<typeof vi.fn<() => void>>;

  beforeEach(() => {
    mockOnLoadMore = vi.fn();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should return a sentinelRef callback', () => {
    const { result } = renderHook(() =>
      useInfiniteScroll({
        onLoadMore: mockOnLoadMore,
        hasMore: true,
        isLoading: false,
        threshold: 300,
      }),
    );

    expect(result.current.sentinelRef).toBeDefined();
    expect(typeof result.current.sentinelRef).toBe('function');
  });

  it('should initialize without errors', () => {
    const { result } = renderHook(() =>
      useInfiniteScroll({
        onLoadMore: mockOnLoadMore,
        hasMore: true,
        isLoading: false,
      }),
    );

    expect(result.current).toBeDefined();
    expect(result.current.sentinelRef).toBeDefined();
    expect(typeof result.current.sentinelRef).toBe('function');
  });

  it('should work with different configurations', () => {
    const { result: result1 } = renderHook(() =>
      useInfiniteScroll({
        onLoadMore: mockOnLoadMore,
        hasMore: true,
        isLoading: false,
        threshold: 100,
        debounceMs: 100,
      }),
    );

    const { result: result2 } = renderHook(() =>
      useInfiniteScroll({
        onLoadMore: mockOnLoadMore,
        hasMore: false,
        isLoading: true,
        threshold: 500,
        debounceMs: 500,
      }),
    );

    expect(result1.current.sentinelRef).toBeDefined();
    expect(result2.current.sentinelRef).toBeDefined();
  });

  it('should accept all required parameters', () => {
    expect(() => {
      renderHook(() =>
        useInfiniteScroll({
          onLoadMore: mockOnLoadMore,
          hasMore: true,
          isLoading: false,
        }),
      );
    }).not.toThrow();
  });

  it('should accept optional parameters', () => {
    expect(() => {
      renderHook(() =>
        useInfiniteScroll({
          onLoadMore: mockOnLoadMore,
          hasMore: true,
          isLoading: false,
          threshold: 200,
          debounceMs: 300,
        }),
      );
    }).not.toThrow();
  });
});

describe('useInfiniteScroll - unproductive-load budget', () => {
  const DEBOUNCE_MS = 300;
  let mockOnLoadMore: ReturnType<typeof vi.fn<() => void>>;

  beforeEach(() => {
    vi.useFakeTimers();
    mockOnLoadMore = vi.fn();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Renders the hook with a mounted sentinel so the intersection observer is live. */
  function renderWithSentinel(initialItemCount?: number, maxUnproductiveLoads?: number) {
    const rendered = renderHook(
      ({ itemCount }: { itemCount?: number }) =>
        useInfiniteScroll({
          onLoadMore: mockOnLoadMore,
          hasMore: true,
          isLoading: false,
          debounceMs: DEBOUNCE_MS,
          itemCount,
          maxUnproductiveLoads,
        }),
      { initialProps: { itemCount: initialItemCount } },
    );

    act(() => rendered.result.current.sentinelRef(document.createElement('div')));

    return rendered;
  }

  /** Fires the latest observer callback and lets the debounce elapse. */
  const intersect = () => {
    const observerCalls = asOpaque<Array<[(entries: Array<{ isIntersecting: boolean }>) => void]>>(
      mockIntersectionObserver.mock.calls,
    );
    const observerCallback = observerCalls.at(-1)![0];
    act(() => {
      observerCallback([{ isIntersecting: true }]);
      vi.advanceTimersByTime(DEBOUNCE_MS);
    });
  };

  it('stalls instead of loading once the consecutive unproductive loads exceed the budget', () => {
    const { result } = renderWithSentinel(1, 3);

    intersect();
    intersect();
    intersect();
    expect(result.current.isStalled).toBe(false);

    intersect();

    // The fourth round is refused rather than paged.
    expect(mockOnLoadMore).toHaveBeenCalledTimes(3);
    expect(result.current.isStalled).toBe(true);
  });

  it('refills the budget whenever a load actually grows the item count', () => {
    const { result, rerender } = renderWithSentinel(1, 3);

    // Six rounds — well past the cap — each one growing the list.
    for (let round = 1; round <= 6; round += 1) {
      intersect();
      rerender({ itemCount: 1 + round });
    }

    expect(mockOnLoadMore).toHaveBeenCalledTimes(6);
    expect(result.current.isStalled).toBe(false);
  });

  it('resumeAutoLoad clears the stall and loads the next page immediately', () => {
    const { result } = renderWithSentinel(1, 3);

    for (let i = 0; i < 4; i += 1) intersect();
    expect(result.current.isStalled).toBe(true);

    act(() => result.current.resumeAutoLoad());

    expect(result.current.isStalled).toBe(false);
    expect(mockOnLoadMore).toHaveBeenCalledTimes(4);
  });

  it('resets the budget and clears the stall when the list shrinks, as on a refresh', () => {
    const { result, rerender } = renderWithSentinel(8, 3);

    for (let i = 0; i < 4; i += 1) intersect();
    expect(result.current.isStalled).toBe(true);

    // A polling refresh replaces the accumulated pages with page one.
    rerender({ itemCount: 2 });
    expect(result.current.isStalled).toBe(false);

    // The fresh, shorter list gets a full budget again: productive rounds keep loading.
    for (let round = 1; round <= 4; round += 1) {
      intersect();
      rerender({ itemCount: 2 + round });
    }
    expect(mockOnLoadMore).toHaveBeenCalledTimes(3 + 4);
    expect(result.current.isStalled).toBe(false);
  });

  it('never stalls when no budget is configured', () => {
    const { result } = renderWithSentinel(undefined, undefined);

    for (let i = 0; i < 10; i += 1) intersect();

    expect(mockOnLoadMore).toHaveBeenCalledTimes(10);
    expect(result.current.isStalled).toBe(false);
  });
});
