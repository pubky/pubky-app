import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useInfiniteScroll } from './useInfiniteScroll';

// Mock IntersectionObserver
const mockObserve = vi.fn();
const mockUnobserve = vi.fn();
const mockDisconnect = vi.fn();

const mockIntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: mockObserve,
  unobserve: mockUnobserve,
  disconnect: mockDisconnect,
}));

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
