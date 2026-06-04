import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PostStreamTypes } from '@/models/stream/post/postStream.types';
import { REACH } from '@/stores/home/home.types';
import { useHotStore } from '@/stores/hot/hot.store';
import { TIMEFRAME } from '@/stores/hot/hot.types';
import { useHotStreamId } from './useHotStreamId';

let mockCurrentUserPubky: string | null = 'viewer-pubky';
const mockHotStore = vi.hoisted(() => {
  const initialState = {
    reach: 'all',
    timeframe: 'today',
  };
  const state = {
    ...initialState,
    setReach: (reach: string) => {
      state.reach = reach;
    },
    setTimeframe: (timeframe: string) => {
      state.timeframe = timeframe;
    },
    reset: () => {
      state.reach = initialState.reach;
      state.timeframe = initialState.timeframe;
    },
  };

  return { state };
});

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (state: { currentUserPubky: string | null }) => unknown) =>
    selector({ currentUserPubky: mockCurrentUserPubky }),
}));

vi.mock('@/stores/hot/hot.store', () => ({
  useHotStore: (selector?: (state: typeof mockHotStore.state) => unknown) =>
    typeof selector === 'function' ? selector(mockHotStore.state) : mockHotStore.state,
}));

describe('useHotStreamId', () => {
  // Reset hot store before each test
  beforeEach(() => {
    const { result } = renderHook(() => useHotStore((state) => state.reset));
    result.current();
    mockCurrentUserPubky = 'viewer-pubky';
  });

  it('should return engagement stream for all reach (default)', () => {
    const { result } = renderHook(() => useHotStreamId());

    expect(result.current).toBe(PostStreamTypes.POPULARITY_ALL_ALL);
    expect(result.current).toBe('total_engagement:all:all');
  });

  it('should update when reach filter changes to following', () => {
    const { result: setReach } = renderHook(() => useHotStore((state) => state.setReach));

    // Change to following
    setReach.current(REACH.FOLLOWING);

    const { result } = renderHook(() => useHotStreamId());
    expect(result.current).toBe(PostStreamTypes.POPULARITY_FOLLOWING_ALL);
    expect(result.current).toBe('total_engagement:following:all');
  });

  it('should update when reach filter changes to friends', () => {
    const { result: setReach } = renderHook(() => useHotStore((state) => state.setReach));

    // Change to friends
    setReach.current(REACH.FRIENDS);

    const { result } = renderHook(() => useHotStreamId());
    expect(result.current).toBe(PostStreamTypes.POPULARITY_FRIENDS_ALL);
    expect(result.current).toBe('total_engagement:friends:all');
  });

  it('should force all reach when no user is authenticated', () => {
    mockCurrentUserPubky = null;
    const { result: setReach } = renderHook(() => useHotStore((state) => state.setReach));
    setReach.current(REACH.FRIENDS);

    const { result } = renderHook(() => useHotStreamId());

    expect(result.current).toBe(PostStreamTypes.POPULARITY_ALL_ALL);
    expect(result.current).toBe('total_engagement:all:all');
  });

  it('should handle all reach options', () => {
    const { result: setReach } = renderHook(() => useHotStore((state) => state.setReach));

    const reachOptions = [
      { reach: REACH.ALL, expected: PostStreamTypes.POPULARITY_ALL_ALL },
      { reach: REACH.FOLLOWING, expected: PostStreamTypes.POPULARITY_FOLLOWING_ALL },
      { reach: REACH.FRIENDS, expected: PostStreamTypes.POPULARITY_FRIENDS_ALL },
    ];

    reachOptions.forEach(({ reach, expected }) => {
      setReach.current(reach);
      const { result } = renderHook(() => useHotStreamId());
      expect(result.current).toBe(expected);
    });
  });

  it('should always use engagement sorting regardless of timeframe', () => {
    const { result: hotStore } = renderHook(() => useHotStore());

    // Set different timeframes - stream ID should always use engagement sorting
    hotStore.current.setTimeframe(TIMEFRAME.TODAY);
    const { result: result1 } = renderHook(() => useHotStreamId());
    expect(result1.current).toContain('total_engagement');

    hotStore.current.setTimeframe(TIMEFRAME.THIS_MONTH);
    const { result: result2 } = renderHook(() => useHotStreamId());
    expect(result2.current).toContain('total_engagement');

    hotStore.current.setTimeframe(TIMEFRAME.ALL_TIME);
    const { result: result3 } = renderHook(() => useHotStreamId());
    expect(result3.current).toContain('total_engagement');
  });

  it('should always use all content types', () => {
    const { result: setReach } = renderHook(() => useHotStore((state) => state.setReach));

    // For any reach, content should be 'all'
    setReach.current(REACH.ALL);
    const { result: result1 } = renderHook(() => useHotStreamId());
    expect(result1.current).toMatch(/:all$/);

    setReach.current(REACH.FOLLOWING);
    const { result: result2 } = renderHook(() => useHotStreamId());
    expect(result2.current).toMatch(/:all$/);
  });

  it('should reflect store state changes immediately', () => {
    const { result: streamIdResult, rerender } = renderHook(() => useHotStreamId());
    const { result: hotStore } = renderHook(() => useHotStore());

    expect(streamIdResult.current).toBe('total_engagement:all:all');

    // Change filter through store
    hotStore.current.setReach(REACH.FRIENDS);
    rerender();

    // Hook should reflect new state
    expect(streamIdResult.current).toBe('total_engagement:friends:all');
  });
});
