import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useCustomStreamId } from './useCustomStreamId';
import { PubkyAppFeedReach, PubkyAppFeedSort, PubkyAppFeedLayout, PubkyAppPostKind } from 'pubky-app-specs';
import type * as Core from '@/core';

// --- Hoisted mocks ---

const { mockUseCustomFeed } = vi.hoisted(() => ({
  mockUseCustomFeed: vi.fn(),
}));

vi.mock('@/hooks/useCustomFeed', () => ({
  useCustomFeed: () => mockUseCustomFeed(),
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

describe('useCustomStreamId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseCustomFeed.mockReturnValue(undefined);
  });

  // ============================================================================
  // Undefined / missing feed
  // ============================================================================

  it('returns undefined when customFeed is undefined', () => {
    mockUseCustomFeed.mockReturnValue(undefined);

    const { result } = renderHook(() => useCustomStreamId());

    expect(result.current).toBeUndefined();
  });

  // ============================================================================
  // Mapping failures → undefined
  // ============================================================================

  it('returns undefined when reach cannot be mapped (e.g. Followers has no home equivalent)', () => {
    mockUseCustomFeed.mockReturnValue(createMockFeed({ reach: PubkyAppFeedReach.Followers }));

    const { result } = renderHook(() => useCustomStreamId());

    expect(result.current).toBeUndefined();
  });

  it('returns undefined when sort cannot be mapped (unknown sort value)', () => {
    mockUseCustomFeed.mockReturnValue(createMockFeed({ sort: 999 as PubkyAppFeedSort }));

    const { result } = renderHook(() => useCustomStreamId());

    expect(result.current).toBeUndefined();
  });

  it('returns undefined when content cannot be mapped (unknown post kind)', () => {
    mockUseCustomFeed.mockReturnValue(createMockFeed({ content: 999 as PubkyAppPostKind }));

    const { result } = renderHook(() => useCustomStreamId());

    expect(result.current).toBeUndefined();
  });

  it('returns undefined when tags array is empty', () => {
    mockUseCustomFeed.mockReturnValue(createMockFeed({ tags: [] }));

    const { result } = renderHook(() => useCustomStreamId());

    expect(result.current).toBeUndefined();
  });

  // ============================================================================
  // Successful stream ID generation
  // ============================================================================

  it('builds streamId with CONTENT.ALL when content is null', () => {
    mockUseCustomFeed.mockReturnValue(
      createMockFeed({
        reach: PubkyAppFeedReach.All,
        sort: PubkyAppFeedSort.Recent,
        content: null,
        tags: ['bitcoin'],
      }),
    );

    const { result } = renderHook(() => useCustomStreamId());

    // getStreamIdFromFilters(SORT.TIMELINE, REACH.ALL, CONTENT.ALL) => 'timeline:all:all'
    // tags joined with ',' => 'bitcoin'
    expect(result.current).toBe('timeline:all:all:bitcoin');
  });

  it('builds streamId with mapped content when content is not null', () => {
    mockUseCustomFeed.mockReturnValue(
      createMockFeed({
        reach: PubkyAppFeedReach.All,
        sort: PubkyAppFeedSort.Recent,
        content: PubkyAppPostKind.Short,
        tags: ['crypto'],
      }),
    );

    const { result } = renderHook(() => useCustomStreamId());

    // getStreamIdFromFilters(SORT.TIMELINE, REACH.ALL, CONTENT.SHORT) => 'timeline:all:short'
    expect(result.current).toBe('timeline:all:short:crypto');
  });

  it('joins multiple tags with comma delimiter', () => {
    mockUseCustomFeed.mockReturnValue(
      createMockFeed({
        reach: PubkyAppFeedReach.Following,
        sort: PubkyAppFeedSort.Recent,
        content: null,
        tags: ['bitcoin', 'lightning', 'nostr'],
      }),
    );

    const { result } = renderHook(() => useCustomStreamId());

    expect(result.current).toBe('timeline:following:all:bitcoin,lightning,nostr');
  });

  it('handles engagement sort correctly', () => {
    mockUseCustomFeed.mockReturnValue(
      createMockFeed({
        reach: PubkyAppFeedReach.All,
        sort: PubkyAppFeedSort.Popularity,
        content: null,
        tags: ['trending'],
      }),
    );

    const { result } = renderHook(() => useCustomStreamId());

    // getStreamIdFromFilters(SORT.ENGAGEMENT, REACH.ALL, CONTENT.ALL) => 'total_engagement:all:all'
    expect(result.current).toBe('total_engagement:all:all:trending');
  });

  it('handles friends reach correctly', () => {
    mockUseCustomFeed.mockReturnValue(
      createMockFeed({
        reach: PubkyAppFeedReach.Friends,
        sort: PubkyAppFeedSort.Recent,
        content: null,
        tags: ['bitcoin'],
      }),
    );

    const { result } = renderHook(() => useCustomStreamId());

    expect(result.current).toBe('timeline:friends:all:bitcoin');
  });

  it('handles Image content mapping correctly', () => {
    mockUseCustomFeed.mockReturnValue(
      createMockFeed({
        reach: PubkyAppFeedReach.All,
        sort: PubkyAppFeedSort.Recent,
        content: PubkyAppPostKind.Image,
        tags: ['photography'],
      }),
    );

    const { result } = renderHook(() => useCustomStreamId());

    expect(result.current).toBe('timeline:all:image:photography');
  });

  it('handles Video content mapping correctly', () => {
    mockUseCustomFeed.mockReturnValue(
      createMockFeed({
        reach: PubkyAppFeedReach.All,
        sort: PubkyAppFeedSort.Recent,
        content: PubkyAppPostKind.Video,
        tags: ['clips'],
      }),
    );

    const { result } = renderHook(() => useCustomStreamId());

    expect(result.current).toBe('timeline:all:video:clips');
  });

  it('handles Long content mapping correctly', () => {
    mockUseCustomFeed.mockReturnValue(
      createMockFeed({
        reach: PubkyAppFeedReach.All,
        sort: PubkyAppFeedSort.Recent,
        content: PubkyAppPostKind.Long,
        tags: ['articles'],
      }),
    );

    const { result } = renderHook(() => useCustomStreamId());

    expect(result.current).toBe('timeline:all:long:articles');
  });

  it('handles Link content mapping correctly', () => {
    mockUseCustomFeed.mockReturnValue(
      createMockFeed({
        reach: PubkyAppFeedReach.All,
        sort: PubkyAppFeedSort.Recent,
        content: PubkyAppPostKind.Link,
        tags: ['bookmarks'],
      }),
    );

    const { result } = renderHook(() => useCustomStreamId());

    expect(result.current).toBe('timeline:all:link:bookmarks');
  });

  it('handles File content mapping correctly', () => {
    mockUseCustomFeed.mockReturnValue(
      createMockFeed({
        reach: PubkyAppFeedReach.All,
        sort: PubkyAppFeedSort.Recent,
        content: PubkyAppPostKind.File,
        tags: ['docs'],
      }),
    );

    const { result } = renderHook(() => useCustomStreamId());

    expect(result.current).toBe('timeline:all:file:docs');
  });

  // ============================================================================
  // Combined filter variations
  // ============================================================================

  it('builds correct streamId for engagement + following + images + multiple tags', () => {
    mockUseCustomFeed.mockReturnValue(
      createMockFeed({
        reach: PubkyAppFeedReach.Following,
        sort: PubkyAppFeedSort.Popularity,
        content: PubkyAppPostKind.Image,
        tags: ['art', 'design'],
      }),
    );

    const { result } = renderHook(() => useCustomStreamId());

    expect(result.current).toBe('total_engagement:following:image:art,design');
  });

  it('builds correct streamId for timeline + friends + videos + single tag', () => {
    mockUseCustomFeed.mockReturnValue(
      createMockFeed({
        reach: PubkyAppFeedReach.Friends,
        sort: PubkyAppFeedSort.Recent,
        content: PubkyAppPostKind.Video,
        tags: ['music'],
      }),
    );

    const { result } = renderHook(() => useCustomStreamId());

    expect(result.current).toBe('timeline:friends:video:music');
  });

  // ============================================================================
  // Reactivity
  // ============================================================================

  it('recomputes streamId when customFeed changes', () => {
    mockUseCustomFeed.mockReturnValue(
      createMockFeed({
        reach: PubkyAppFeedReach.All,
        sort: PubkyAppFeedSort.Recent,
        content: null,
        tags: ['bitcoin'],
      }),
    );

    const { result, rerender } = renderHook(() => useCustomStreamId());

    expect(result.current).toBe('timeline:all:all:bitcoin');

    // Update the feed
    mockUseCustomFeed.mockReturnValue(
      createMockFeed({
        reach: PubkyAppFeedReach.Following,
        sort: PubkyAppFeedSort.Popularity,
        content: PubkyAppPostKind.Short,
        tags: ['nostr', 'pubky'],
      }),
    );

    rerender();

    expect(result.current).toBe('total_engagement:following:short:nostr,pubky');
  });

  it('transitions from undefined to a valid streamId when feed becomes available', () => {
    mockUseCustomFeed.mockReturnValue(undefined);

    const { result, rerender } = renderHook(() => useCustomStreamId());

    expect(result.current).toBeUndefined();

    mockUseCustomFeed.mockReturnValue(
      createMockFeed({
        reach: PubkyAppFeedReach.All,
        sort: PubkyAppFeedSort.Recent,
        content: null,
        tags: ['bitcoin'],
      }),
    );

    rerender();

    expect(result.current).toBe('timeline:all:all:bitcoin');
  });

  it('transitions from a valid streamId to undefined when feed becomes unavailable', () => {
    mockUseCustomFeed.mockReturnValue(
      createMockFeed({
        reach: PubkyAppFeedReach.All,
        sort: PubkyAppFeedSort.Recent,
        content: null,
        tags: ['bitcoin'],
      }),
    );

    const { result, rerender } = renderHook(() => useCustomStreamId());

    expect(result.current).toBe('timeline:all:all:bitcoin');

    mockUseCustomFeed.mockReturnValue(undefined);

    rerender();

    expect(result.current).toBeUndefined();
  });
});
