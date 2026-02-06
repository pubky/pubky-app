import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useRepostGrouping } from './useRepostGrouping';

// Hoist mock data
const { mockQueryResult, setMockQueryResult } = vi.hoisted(() => {
  const queryData = { current: undefined as unknown };
  return {
    mockQueryResult: queryData,
    setMockQueryResult: (value: unknown) => {
      queryData.current = value;
    },
  };
});

// Mock dexie-react-hooks
vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: vi.fn((_queryFn, _deps, initialValue) => {
    if (mockQueryResult.current === undefined) return initialValue;
    return mockQueryResult.current;
  }),
}));

// Hoist Core mocks
const { mockFindByIdsPreserveOrder, mockGroupPlainReposts } = vi.hoisted(() => ({
  mockFindByIdsPreserveOrder: vi.fn(),
  mockGroupPlainReposts: vi.fn(() => []),
}));

// Mock Core
vi.mock('@/core', async () => {
  const actual = await vi.importActual('@/core');
  return {
    ...actual,
    PostDetailsModel: {
      findByIdsPreserveOrder: mockFindByIdsPreserveOrder,
    },
    PostRelationshipsModel: {
      findByIdsPreserveOrder: mockFindByIdsPreserveOrder,
    },
    groupPlainReposts: mockGroupPlainReposts,
  };
});

// Mock hooks
vi.mock('@/hooks', async () => {
  const actual = await vi.importActual('@/hooks');
  return {
    ...actual,
    useCurrentUserProfile: vi.fn(() => ({
      currentUserPubky: 'current-user',
      userDetails: null,
    })),
  };
});

// Mock libs
vi.mock('@/libs', async () => {
  const actual = await vi.importActual('@/libs');
  return {
    ...actual,
    Logger: {
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
    },
  };
});

describe('useRepostGrouping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setMockQueryResult(undefined);
  });

  it('returns empty items for empty postIds', () => {
    setMockQueryResult([]);

    const { result } = renderHook(() => useRepostGrouping({ postIds: [] }));

    expect(result.current.items).toEqual([]);
    expect(result.current.isGrouping).toBe(false);
  });

  it('returns isGrouping true when query is loading', () => {
    setMockQueryResult(undefined);

    const { result } = renderHook(() => useRepostGrouping({ postIds: ['post1'] }));

    expect(result.current.items).toEqual([]);
    expect(result.current.isGrouping).toBe(true);
  });

  it('returns grouped items when query completes', () => {
    const mockItems = [
      { type: 'single' as const, postId: 'post1' },
      { type: 'single' as const, postId: 'post2' },
    ];
    setMockQueryResult(mockItems);

    const { result } = renderHook(() => useRepostGrouping({ postIds: ['post1', 'post2'] }));

    expect(result.current.items).toEqual(mockItems);
    expect(result.current.isGrouping).toBe(false);
  });

  it('returns repost groups when posts are grouped', () => {
    const mockItems = [
      {
        type: 'repost-group' as const,
        originalPostId: 'original:post1',
        repostPostIds: ['user1:repost1', 'user2:repost2'],
        reposterIds: ['user1', 'user2'],
        earliestTimestamp: 1000,
        includesCurrentUser: false,
      },
    ];
    setMockQueryResult(mockItems);

    const { result } = renderHook(() => useRepostGrouping({ postIds: ['user1:repost1', 'user2:repost2'] }));

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].type).toBe('repost-group');
  });
});
