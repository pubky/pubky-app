'use client';

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTagSuggestions } from './useTagSuggestions';
import { TAG_SUGGESTIONS_DEFAULT_LIMIT } from './useTagSuggestions.constants';

// Hoist mock functions
const { mockFetchTagsByPrefix } = vi.hoisted(() => {
  return {
    mockFetchTagsByPrefix: vi.fn(),
  };
});

// Mock dependencies
vi.mock('@/controllers/search/search', () => ({
  SearchController: {
    fetchTagsByPrefix: (...args: unknown[]) => mockFetchTagsByPrefix(...args),
  },
}));

// Mock lodash-es debounce to make it synchronous for testing
vi.mock('lodash-es', () => ({
  debounce: vi.fn((fn) => {
    const debouncedFn = vi.fn(fn);
    debouncedFn.cancel = vi.fn();
    return debouncedFn;
  }),
}));

describe('useTagSuggestions', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockFetchTagsByPrefix.mockReset();
    mockFetchTagsByPrefix.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns empty suggestions when query is empty', () => {
    const { result } = renderHook(() => useTagSuggestions({ query: '' }));

    expect(result.current.suggestions).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });

  it('returns empty suggestions when query is less than minimum length', () => {
    const { result } = renderHook(() => useTagSuggestions({ query: 'ab' }));

    expect(result.current.suggestions).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });

  it('fetches tag suggestions when query has minimum length', async () => {
    mockFetchTagsByPrefix.mockResolvedValue(['bitcoin', 'bitconnect', 'bitstamp']);

    const { result } = renderHook(() => useTagSuggestions({ query: 'bit' }));

    // Wait for promises to resolve
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.suggestions).toEqual(['bitcoin', 'bitconnect', 'bitstamp']);
    expect(mockFetchTagsByPrefix).toHaveBeenCalledWith({
      prefix: 'bit',
      limit: TAG_SUGGESTIONS_DEFAULT_LIMIT,
    });
  });

  it('filters out excluded tags from suggestions', async () => {
    mockFetchTagsByPrefix.mockResolvedValue(['bitcoin', 'bitconnect', 'bitstamp']);

    const { result } = renderHook(() =>
      useTagSuggestions({
        query: 'bit',
        excludeTags: ['bitcoin', 'bitstamp'],
      }),
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.suggestions).toEqual(['bitconnect']);
  });

  it('returns empty suggestions when disabled', async () => {
    mockFetchTagsByPrefix.mockResolvedValue(['bitcoin']);

    const { result } = renderHook(() =>
      useTagSuggestions({
        query: 'bit',
        enabled: false,
      }),
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.suggestions).toEqual([]);
    expect(mockFetchTagsByPrefix).not.toHaveBeenCalled();
  });

  it('handles API errors gracefully', async () => {
    mockFetchTagsByPrefix.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useTagSuggestions({ query: 'bit' }));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.suggestions).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });

  it('clears suggestions when query becomes empty', async () => {
    mockFetchTagsByPrefix.mockResolvedValue(['bitcoin']);

    const { result, rerender } = renderHook(({ query }) => useTagSuggestions({ query }), {
      initialProps: { query: 'bit' },
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.suggestions).toEqual(['bitcoin']);

    // Clear the query
    rerender({ query: '' });

    expect(result.current.suggestions).toEqual([]);
  });

  it('respects custom limit parameter', async () => {
    mockFetchTagsByPrefix.mockResolvedValue(['a', 'b', 'c']);

    renderHook(() =>
      useTagSuggestions({
        query: 'test',
        limit: 10,
      }),
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockFetchTagsByPrefix).toHaveBeenCalledWith({
      prefix: 'test',
      limit: 10,
    });
  });

  it('filters excluded tags case-insensitively', async () => {
    mockFetchTagsByPrefix.mockResolvedValue(['Bitcoin', 'BITCONNECT', 'bitstamp']);

    const { result } = renderHook(() =>
      useTagSuggestions({
        query: 'bit',
        excludeTags: ['BITCOIN', 'BitConnect'],
      }),
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.suggestions).toEqual(['bitstamp']);
  });

  it('sets loading state while fetching', async () => {
    // Create a promise that we can control
    let resolvePromise: (value: string[]) => void;
    const controlledPromise = new Promise<string[]>((resolve) => {
      resolvePromise = resolve;
    });
    mockFetchTagsByPrefix.mockReturnValue(controlledPromise);

    const { result } = renderHook(() => useTagSuggestions({ query: 'bit' }));

    // Should be loading
    expect(result.current.isLoading).toBe(true);

    // Resolve the promise
    await act(async () => {
      resolvePromise!(['bitcoin']);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.suggestions).toEqual(['bitcoin']);
  });

  it('ignores stale responses when query changes', async () => {
    // First request returns after second
    let resolveFirst: (value: string[]) => void;
    const firstPromise = new Promise<string[]>((resolve) => {
      resolveFirst = resolve;
    });

    mockFetchTagsByPrefix.mockReturnValueOnce(firstPromise);

    const { result, rerender } = renderHook(({ query }) => useTagSuggestions({ query }), {
      initialProps: { query: 'old' },
    });

    // Change query before first completes - setup mock for new query
    mockFetchTagsByPrefix.mockResolvedValue(['new-results']);
    rerender({ query: 'new' });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    // Now resolve the first (stale) promise
    await act(async () => {
      resolveFirst!(['old-results']);
      await Promise.resolve();
    });

    // Should show new results, not stale ones
    expect(result.current.suggestions).toEqual(['new-results']);
  });

  it('trims whitespace from query', async () => {
    mockFetchTagsByPrefix.mockResolvedValue(['bitcoin']);

    renderHook(() => useTagSuggestions({ query: '  bit  ' }));

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockFetchTagsByPrefix).toHaveBeenCalledWith({
      prefix: 'bit',
      limit: TAG_SUGGESTIONS_DEFAULT_LIMIT,
    });
  });
});
