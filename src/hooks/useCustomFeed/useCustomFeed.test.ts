import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useCustomFeed } from './useCustomFeed';
import { PubkyAppFeedReach, PubkyAppFeedSort, PubkyAppFeedLayout } from 'pubky-app-specs';
import type * as Core from '@/core';

// --- Hoisted mocks ---

const { mockUseLiveQuery, mockUsePathname, mockUseParams } = vi.hoisted(() => ({
  mockUseLiveQuery: vi.fn(),
  mockUsePathname: vi.fn(),
  mockUseParams: vi.fn(),
}));

// Mock dexie-react-hooks – database connections must be mocked per testing guidelines.
vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: (...args: unknown[]) => mockUseLiveQuery(...args),
}));

// Mock next/navigation hooks
vi.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
  useParams: () => mockUseParams(),
}));

// Mock Core (FeedController + Logger)
vi.mock('@/core', () => ({
  FeedController: {
    get: vi.fn(),
  },
}));

vi.mock('@/libs', () => ({
  Logger: {
    error: vi.fn(),
  },
}));

// --- Helpers ---

const createMockFeed = (overrides: Partial<Core.FeedModelSchema> = {}): Core.FeedModelSchema => ({
  id: 'feed-abc123',
  name: 'Bitcoin News',
  tags: ['bitcoin', 'lightning'],
  reach: PubkyAppFeedReach.All,
  sort: PubkyAppFeedSort.Recent,
  content: null,
  layout: PubkyAppFeedLayout.Columns,
  created_at: Date.now(),
  updated_at: Date.now(),
  ...overrides,
});

// --- Tests ---

describe('useCustomFeed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: on a feed route with a valid id
    mockUsePathname.mockReturnValue('/feed/feed-abc123');
    mockUseParams.mockReturnValue({ id: 'feed-abc123' });
  });

  it('returns the custom feed when on a feed route with a valid id', () => {
    const mockFeed = createMockFeed();
    mockUseLiveQuery.mockReturnValue(mockFeed);

    const { result } = renderHook(() => useCustomFeed());

    expect(result.current).toEqual(mockFeed);
  });

  it('returns undefined when not on a feed route', () => {
    mockUsePathname.mockReturnValue('/home');
    mockUseLiveQuery.mockReturnValue(undefined);

    const { result } = renderHook(() => useCustomFeed());

    expect(result.current).toBeUndefined();
  });

  it('returns undefined when id param is missing', () => {
    mockUseParams.mockReturnValue({});
    mockUseLiveQuery.mockReturnValue(undefined);

    const { result } = renderHook(() => useCustomFeed());

    expect(result.current).toBeUndefined();
  });

  it('returns undefined while the live query is loading', () => {
    mockUseLiveQuery.mockReturnValue(undefined);

    const { result } = renderHook(() => useCustomFeed());

    expect(result.current).toBeUndefined();
  });

  it('passes correct dependencies to useLiveQuery', () => {
    mockUseLiveQuery.mockReturnValue(undefined);

    renderHook(() => useCustomFeed());

    expect(mockUseLiveQuery).toHaveBeenCalledTimes(1);

    // Second argument is the dependency array [isFeedRoute, id]
    const deps = mockUseLiveQuery.mock.calls[0][1];
    expect(deps).toEqual([true, 'feed-abc123']);
  });

  it('passes isFeedRoute as false when pathname does not start with /feed', () => {
    mockUsePathname.mockReturnValue('/settings');
    mockUseLiveQuery.mockReturnValue(undefined);

    renderHook(() => useCustomFeed());

    const deps = mockUseLiveQuery.mock.calls[0][1];
    expect(deps[0]).toBe(false);
  });

  it('calls FeedController.get with correct feedId inside the query function', async () => {
    const mockFeed = createMockFeed();
    const Core = await import('@/core');
    vi.mocked(Core.FeedController.get).mockResolvedValue(mockFeed);

    // Execute the query function that useLiveQuery receives
    mockUseLiveQuery.mockImplementation((queryFn: () => Promise<unknown>) => {
      void queryFn();
      return mockFeed;
    });

    renderHook(() => useCustomFeed());

    expect(Core.FeedController.get).toHaveBeenCalledWith({ feedId: 'feed-abc123' });
  });

  it('returns undefined and logs error when FeedController.get throws', async () => {
    const Core = await import('@/core');
    const Libs = await import('@/libs');
    const error = new Error('DB read failed');
    vi.mocked(Core.FeedController.get).mockRejectedValue(error);

    // Execute the query function and capture its return value
    let queryResult: unknown;
    mockUseLiveQuery.mockImplementation((queryFn: () => Promise<unknown>) => {
      queryFn().then((val) => {
        queryResult = val;
      });
      return undefined;
    });

    const { result } = renderHook(() => useCustomFeed());

    // Allow the promise to resolve
    await vi.waitFor(() => {
      expect(Libs.Logger.error).toHaveBeenCalledWith('[useCustomFeed] Failed to query custom feed', {
        error,
      });
    });

    expect(queryResult).toBeUndefined();
    expect(result.current).toBeUndefined();
  });

  it('query function returns undefined when not on feed route', async () => {
    mockUsePathname.mockReturnValue('/home');

    let queryResult: unknown = 'not-set';
    mockUseLiveQuery.mockImplementation((queryFn: () => Promise<unknown>) => {
      queryFn().then((val) => {
        queryResult = val;
      });
      return undefined;
    });

    renderHook(() => useCustomFeed());

    await vi.waitFor(() => {
      expect(queryResult).toBeUndefined();
    });
  });

  it('query function returns undefined when id is missing', async () => {
    mockUseParams.mockReturnValue({});

    let queryResult: unknown = 'not-set';
    mockUseLiveQuery.mockImplementation((queryFn: () => Promise<unknown>) => {
      queryFn().then((val) => {
        queryResult = val;
      });
      return undefined;
    });

    renderHook(() => useCustomFeed());

    await vi.waitFor(() => {
      expect(queryResult).toBeUndefined();
    });
  });
});
