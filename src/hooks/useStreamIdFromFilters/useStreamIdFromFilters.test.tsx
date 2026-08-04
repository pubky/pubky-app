import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PostStreamTypes } from '@/models/stream/post/postStream.types';
import { useHomeStore } from '@/stores/home/home.store';
import { CONTENT, REACH, SORT } from '@/stores/home/home.types';
import { useStreamIdFromFilters } from './useStreamIdFromFilters';

let mockCurrentUserPubky: string | null = 'viewer-pubky';
let mockAuthHasHydrated = true;
const mockHomeStore = vi.hoisted(() => {
  const initialState = {
    sort: 'timeline',
    reach: 'all',
    content: 'all',
    profileTags: [] as string[],
    taggedAsActive: false,
    hasHydrated: true,
  };
  const state = {
    ...initialState,
    setSort: (sort: string) => {
      state.sort = sort;
    },
    setReach: (reach: string) => {
      state.reach = reach;
    },
    setContent: (content: string) => {
      state.content = content;
    },
    setProfileTags: (profileTags: string[]) => {
      state.profileTags = profileTags;
    },
    setTaggedAsActive: (taggedAsActive: boolean) => {
      state.taggedAsActive = taggedAsActive;
    },
    setHasHydrated: (hasHydrated: boolean) => {
      state.hasHydrated = hasHydrated;
    },
    reset: () => {
      state.sort = initialState.sort;
      state.reach = initialState.reach;
      state.content = initialState.content;
      state.profileTags = initialState.profileTags;
      state.taggedAsActive = initialState.taggedAsActive;
      state.hasHydrated = initialState.hasHydrated;
    },
  };

  return { state };
});

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (state: { currentUserPubky: string | null; hasHydrated: boolean }) => unknown) =>
    selector({ currentUserPubky: mockCurrentUserPubky, hasHydrated: mockAuthHasHydrated }),
}));

vi.mock('@/stores/home/home.store', () => ({
  useHomeStore: (selector?: (state: typeof mockHomeStore.state) => unknown) =>
    typeof selector === 'function' ? selector(mockHomeStore.state) : mockHomeStore.state,
}));

describe('useStreamIdFromFilters', () => {
  // Reset filters before each test
  beforeEach(() => {
    const { result } = renderHook(() => useHomeStore((state) => state.reset));
    result.current();
    mockCurrentUserPubky = 'viewer-pubky';
    mockAuthHasHydrated = true;
  });

  it('should not resolve a stream before auth hydration', () => {
    mockAuthHasHydrated = false;

    const { result } = renderHook(() => useStreamIdFromFilters());

    expect(result.current).toBeUndefined();
  });

  it('should not resolve a stream before Home persistence hydration', () => {
    const { result: setHasHydrated } = renderHook(() => useHomeStore((state) => state.setHasHydrated));
    setHasHydrated.current(false);

    const { result } = renderHook(() => useStreamIdFromFilters());

    expect(result.current).toBeUndefined();
  });

  it('should return default streamId (timeline:all:all)', () => {
    const { result } = renderHook(() => useStreamIdFromFilters());

    expect(result.current).toBe(PostStreamTypes.TIMELINE_ALL_ALL);
    expect(result.current).toBe('timeline:all:all');
  });

  it('should update when sort filter changes', () => {
    const { result: streamIdResult } = renderHook(() => useStreamIdFromFilters());
    const { result: setSort } = renderHook(() => useHomeStore((state) => state.setSort));

    expect(streamIdResult.current).toBe('timeline:all:all');

    // Change to popularity
    setSort.current(SORT.ENGAGEMENT);

    // Re-render to get updated streamId
    const { result: updatedResult } = renderHook(() => useStreamIdFromFilters());
    expect(updatedResult.current).toBe('total_engagement:all:all');
  });

  it('should update when reach filter changes', () => {
    const { result: setReach } = renderHook(() => useHomeStore((state) => state.setReach));

    // Change to following
    setReach.current(REACH.FOLLOWING);

    const { result } = renderHook(() => useStreamIdFromFilters());
    expect(result.current).toBe(PostStreamTypes.TIMELINE_FOLLOWING_ALL);
    expect(result.current).toBe('timeline:following:all');
  });

  it('should force all reach when no user is authenticated', () => {
    mockCurrentUserPubky = null;
    const { result: setReach } = renderHook(() => useHomeStore((state) => state.setReach));
    setReach.current(REACH.FOLLOWING);

    const { result } = renderHook(() => useStreamIdFromFilters());

    expect(result.current).toBe(PostStreamTypes.TIMELINE_ALL_ALL);
    expect(result.current).toBe('timeline:all:all');
  });

  it('should update when content filter changes', () => {
    const { result: setContent } = renderHook(() => useHomeStore((state) => state.setContent));

    // Change to images
    setContent.current(CONTENT.IMAGES);

    const { result } = renderHook(() => useStreamIdFromFilters());
    expect(result.current).toBe(PostStreamTypes.TIMELINE_ALL_IMAGE);
    expect(result.current).toBe('timeline:all:image');
  });

  it('should update when content filter changes to collections', () => {
    const { result: setContent } = renderHook(() => useHomeStore((state) => state.setContent));

    setContent.current(CONTENT.COLLECTIONS);

    const { result } = renderHook(() => useStreamIdFromFilters());
    expect(result.current).toBe(PostStreamTypes.TIMELINE_ALL_COLLECTION);
    expect(result.current).toBe('timeline:all:collection');
  });

  it('should prefer the provided content override over store content', () => {
    const { result: setContent } = renderHook(() => useHomeStore((state) => state.setContent));

    setContent.current(CONTENT.SHORT);

    const { result } = renderHook(() => useStreamIdFromFilters(CONTENT.ALL));
    expect(result.current).toBe(PostStreamTypes.TIMELINE_ALL_ALL);
  });

  it('should update with multiple filter changes', () => {
    const { result: setSort } = renderHook(() => useHomeStore((state) => state.setSort));
    const { result: setReach } = renderHook(() => useHomeStore((state) => state.setReach));
    const { result: setContent } = renderHook(() => useHomeStore((state) => state.setContent));

    // Change all filters
    setSort.current(SORT.ENGAGEMENT);
    setReach.current(REACH.FRIENDS);
    setContent.current(CONTENT.VIDEOS);

    const { result } = renderHook(() => useStreamIdFromFilters());
    expect(result.current).toBe(PostStreamTypes.POPULARITY_FRIENDS_VIDEO);
    expect(result.current).toBe('total_engagement:friends:video');
  });

  it('should return stable stream IDs for all combinations', () => {
    const { result: setReach } = renderHook(() => useHomeStore((state) => state.setReach));

    // TIMELINE_ALL_ALL
    const { result: result1 } = renderHook(() => useStreamIdFromFilters());
    expect(result1.current).toBe(PostStreamTypes.TIMELINE_ALL_ALL);

    // TIMELINE_FOLLOWING_ALL
    setReach.current(REACH.FOLLOWING);
    const { result: result2 } = renderHook(() => useStreamIdFromFilters());
    expect(result2.current).toBe(PostStreamTypes.TIMELINE_FOLLOWING_ALL);

    // TIMELINE_FRIENDS_ALL
    setReach.current(REACH.FRIENDS);
    const { result: result3 } = renderHook(() => useStreamIdFromFilters());
    expect(result3.current).toBe(PostStreamTypes.TIMELINE_FRIENDS_ALL);

    // TIMELINE_ALL_IMAGE
    setReach.current(REACH.ALL);
    const { result: setContent } = renderHook(() => useHomeStore((state) => state.setContent));
    setContent.current(CONTENT.IMAGES);
    const { result: result4 } = renderHook(() => useStreamIdFromFilters());
    expect(result4.current).toBe(PostStreamTypes.TIMELINE_ALL_IMAGE);
  });

  it('should return stable stream IDs for all valid combinations', () => {
    const { result: setSort } = renderHook(() => useHomeStore((state) => state.setSort));
    const { result: setContent } = renderHook(() => useHomeStore((state) => state.setContent));

    // Set combination - all should be in enum
    setSort.current(SORT.ENGAGEMENT);
    setContent.current(CONTENT.LONG);

    const { result } = renderHook(() => useStreamIdFromFilters());
    expect(result.current).toBe(PostStreamTypes.POPULARITY_ALL_LONG);
    expect(result.current).toBe('total_engagement:all:long');
  });

  it('should handle all reach options', () => {
    const { result: setReach } = renderHook(() => useHomeStore((state) => state.setReach));

    // Test each reach option
    const reachOptions = [
      { reach: REACH.ALL, expected: 'timeline:all:all' },
      { reach: REACH.NETWORK, expected: 'timeline:wot:all' },
      { reach: REACH.FOLLOWING, expected: 'timeline:following:all' },
      { reach: REACH.FRIENDS, expected: 'timeline:friends:all' },
      { reach: REACH.ME, expected: 'timeline:author:viewer-pubky:all' },
    ];

    reachOptions.forEach(({ reach, expected }) => {
      setReach.current(reach);
      const { result } = renderHook(() => useStreamIdFromFilters());
      expect(result.current).toBe(expected);
    });
  });

  it('should build content-specific author stream when reach is me', () => {
    const { result: setReach } = renderHook(() => useHomeStore((state) => state.setReach));
    const { result: setContent } = renderHook(() => useHomeStore((state) => state.setContent));

    setReach.current(REACH.ME);
    setContent.current(CONTENT.IMAGES);

    const { result } = renderHook(() => useStreamIdFromFilters());

    expect(result.current).toBe('timeline:author:viewer-pubky:image');
  });

  it('should preserve popularity sorting when reach is me', () => {
    const { result: setReach } = renderHook(() => useHomeStore((state) => state.setReach));
    const { result: setSort } = renderHook(() => useHomeStore((state) => state.setSort));

    setReach.current(REACH.ME);
    setSort.current(SORT.ENGAGEMENT);

    const { result } = renderHook(() => useStreamIdFromFilters());

    expect(result.current).toBe('total_engagement:author:viewer-pubky:all');
  });

  it('should build a depth-2 wot_domain stream when Tagged as is active', () => {
    const { result: setTaggedAsActive } = renderHook(() => useHomeStore((state) => state.setTaggedAsActive));
    const { result: setProfileTags } = renderHook(() => useHomeStore((state) => state.setProfileTags));

    setProfileTags.current(['dev', 'bitcoin']);
    setTaggedAsActive.current(true);

    const { result } = renderHook(() => useStreamIdFromFilters());

    expect(result.current).toBe('timeline:wot_domain:2:all:bitcoin,dev');
  });

  it('should use the same Tagged-as stream regardless of the parked base reach', () => {
    const { result: setReach } = renderHook(() => useHomeStore((state) => state.setReach));
    const { result: setTaggedAsActive } = renderHook(() => useHomeStore((state) => state.setTaggedAsActive));
    const { result: setProfileTags } = renderHook(() => useHomeStore((state) => state.setProfileTags));

    setProfileTags.current(['bitcoin']);
    setTaggedAsActive.current(true);

    setReach.current(REACH.FOLLOWING);
    setTaggedAsActive.current(true);
    const { result: followingResult } = renderHook(() => useStreamIdFromFilters());

    setReach.current(REACH.FRIENDS);
    setTaggedAsActive.current(true);
    const { result: friendsResult } = renderHook(() => useStreamIdFromFilters());

    expect(followingResult.current).toBe('timeline:wot_domain:2:all:bitcoin');
    expect(friendsResult.current).toBe('timeline:wot_domain:2:all:bitcoin');
  });

  it('should keep parked profile tags out of the base stream', () => {
    const { result: setReach } = renderHook(() => useHomeStore((state) => state.setReach));
    const { result: setProfileTags } = renderHook(() => useHomeStore((state) => state.setProfileTags));

    setProfileTags.current(['bitcoin']);

    setReach.current(REACH.ALL);
    const { result: allResult } = renderHook(() => useStreamIdFromFilters());

    expect(allResult.current).toBe('timeline:all:all');
  });

  it('should keep the Me base stream while Tagged as is inactive', () => {
    const { result: setReach } = renderHook(() => useHomeStore((state) => state.setReach));
    const { result: setProfileTags } = renderHook(() => useHomeStore((state) => state.setProfileTags));

    setReach.current(REACH.ME);
    setProfileTags.current(['dev', 'bitcoin']);

    const { result: meResult } = renderHook(() => useStreamIdFromFilters());

    expect(meResult.current).toBe('timeline:author:viewer-pubky:all');
  });

  it('should include content kind and emoji profile tags in wot_domain stream IDs', () => {
    const { result: setSort } = renderHook(() => useHomeStore((state) => state.setSort));
    const { result: setReach } = renderHook(() => useHomeStore((state) => state.setReach));
    const { result: setContent } = renderHook(() => useHomeStore((state) => state.setContent));
    const { result: setProfileTags } = renderHook(() => useHomeStore((state) => state.setProfileTags));
    const { result: setTaggedAsActive } = renderHook(() => useHomeStore((state) => state.setTaggedAsActive));

    setSort.current(SORT.ENGAGEMENT);
    setReach.current(REACH.NETWORK);
    setContent.current(CONTENT.IMAGES);
    setProfileTags.current(['🔥']);
    setTaggedAsActive.current(true);

    const { result } = renderHook(() => useStreamIdFromFilters());

    expect(result.current).toBe('total_engagement:wot_domain:2:image:🔥');
  });

  it('should handle all content types', () => {
    const { result: setContent } = renderHook(() => useHomeStore((state) => state.setContent));

    const contentOptions = [
      { content: CONTENT.ALL, expected: 'timeline:all:all' },
      { content: CONTENT.SHORT, expected: 'timeline:all:short' },
      { content: CONTENT.LONG, expected: 'timeline:all:long' },
      { content: CONTENT.COLLECTIONS, expected: 'timeline:all:collection' },
      { content: CONTENT.IMAGES, expected: 'timeline:all:image' },
      { content: CONTENT.VIDEOS, expected: 'timeline:all:video' },
      { content: CONTENT.LINKS, expected: 'timeline:all:link' },
      { content: CONTENT.FILES, expected: 'timeline:all:file' },
    ];

    contentOptions.forEach(({ content, expected }) => {
      setContent.current(content);
      const { result } = renderHook(() => useStreamIdFromFilters());
      expect(result.current).toBe(expected);
    });
  });

  it('should reflect store state changes immediately', () => {
    const { result: streamIdResult, rerender } = renderHook(() => useStreamIdFromFilters());
    const { result: homeStore } = renderHook(() => useHomeStore());

    expect(streamIdResult.current).toBe('timeline:all:all');

    // Change filter through store
    homeStore.current.setSort(SORT.ENGAGEMENT);
    rerender();

    // Hook should reflect new state
    expect(streamIdResult.current).toBe('total_engagement:all:all');
  });
});
