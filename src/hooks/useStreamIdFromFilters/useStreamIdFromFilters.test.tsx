import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { PostStreamTypes } from '@/models/stream/post/postStream.types';
import { useHomeStore } from '@/stores/home/home.store';
import { CONTENT, REACH, SORT } from '@/stores/home/home.types';
import { useStreamIdFromFilters } from './useStreamIdFromFilters';

describe('useStreamIdFromFilters', () => {
  // Reset filters before each test
  beforeEach(() => {
    const { result } = renderHook(() => useHomeStore((state) => state.reset));
    result.current();
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

  it('should update when content filter changes', () => {
    const { result: setContent } = renderHook(() => useHomeStore((state) => state.setContent));

    // Change to images
    setContent.current(CONTENT.IMAGES);

    const { result } = renderHook(() => useStreamIdFromFilters());
    expect(result.current).toBe(PostStreamTypes.TIMELINE_ALL_IMAGE);
    expect(result.current).toBe('timeline:all:image');
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

  it('should return PostStreamTypes enum for all combinations', () => {
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

  it('should return PostStreamTypes enum for all valid combinations', () => {
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
      { reach: REACH.FOLLOWING, expected: 'timeline:following:all' },
      { reach: REACH.FRIENDS, expected: 'timeline:friends:all' },
    ];

    reachOptions.forEach(({ reach, expected }) => {
      setReach.current(reach);
      const { result } = renderHook(() => useStreamIdFromFilters());
      expect(result.current).toBe(expected);
    });
  });

  it('should handle all content types', () => {
    const { result: setContent } = renderHook(() => useHomeStore((state) => state.setContent));

    const contentOptions = [
      { content: CONTENT.ALL, expected: 'timeline:all:all' },
      { content: CONTENT.SHORT, expected: 'timeline:all:short' },
      { content: CONTENT.LONG, expected: 'timeline:all:long' },
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
