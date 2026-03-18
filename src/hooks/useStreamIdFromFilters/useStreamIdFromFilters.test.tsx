import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useStreamIdFromFilters } from './useStreamIdFromFilters';
import * as Core from '@/core';

describe('useStreamIdFromFilters', () => {
  // Reset filters before each test
  beforeEach(() => {
    const { result } = renderHook(() => Core.useHomeStore((state) => state.reset));
    result.current();
  });

  it('should return default streamId (timeline:all:all)', () => {
    const { result } = renderHook(() => useStreamIdFromFilters());

    expect(result.current).toBe(Core.PostStreamTypes.TIMELINE_ALL_ALL);
    expect(result.current).toBe('timeline:all:all');
  });

  it('should update when sort filter changes', () => {
    const { result: streamIdResult } = renderHook(() => useStreamIdFromFilters());
    const { result: setSort } = renderHook(() => Core.useHomeStore((state) => state.setSort));

    expect(streamIdResult.current).toBe('timeline:all:all');

    // Change to popularity
    setSort.current(Core.SORT.ENGAGEMENT);

    // Re-render to get updated streamId
    const { result: updatedResult } = renderHook(() => useStreamIdFromFilters());
    expect(updatedResult.current).toBe('total_engagement:all:all');
  });

  it('should update when reach filter changes', () => {
    const { result: setReach } = renderHook(() => Core.useHomeStore((state) => state.setReach));

    // Change to following
    setReach.current(Core.REACH.FOLLOWING);

    const { result } = renderHook(() => useStreamIdFromFilters());
    expect(result.current).toBe(Core.PostStreamTypes.TIMELINE_FOLLOWING_ALL);
    expect(result.current).toBe('timeline:following:all');
  });

  it('should update when content filter changes', () => {
    const { result: setContent } = renderHook(() => Core.useHomeStore((state) => state.setContent));

    // Change to images
    setContent.current(Core.CONTENT.IMAGES);

    const { result } = renderHook(() => useStreamIdFromFilters());
    expect(result.current).toBe(Core.PostStreamTypes.TIMELINE_ALL_IMAGE);
    expect(result.current).toBe('timeline:all:image');
  });

  it('should prefer the provided content override over store content', () => {
    const { result: setContent } = renderHook(() => Core.useHomeStore((state) => state.setContent));

    setContent.current(Core.CONTENT.SHORT);

    const { result } = renderHook(() => useStreamIdFromFilters(Core.CONTENT.ALL));
    expect(result.current).toBe(Core.PostStreamTypes.TIMELINE_ALL_ALL);
  });

  it('should update with multiple filter changes', () => {
    const { result: setSort } = renderHook(() => Core.useHomeStore((state) => state.setSort));
    const { result: setReach } = renderHook(() => Core.useHomeStore((state) => state.setReach));
    const { result: setContent } = renderHook(() => Core.useHomeStore((state) => state.setContent));

    // Change all filters
    setSort.current(Core.SORT.ENGAGEMENT);
    setReach.current(Core.REACH.FRIENDS);
    setContent.current(Core.CONTENT.VIDEOS);

    const { result } = renderHook(() => useStreamIdFromFilters());
    expect(result.current).toBe(Core.PostStreamTypes.POPULARITY_FRIENDS_VIDEO);
    expect(result.current).toBe('total_engagement:friends:video');
  });

  it('should return PostStreamTypes enum for all combinations', () => {
    const { result: setReach } = renderHook(() => Core.useHomeStore((state) => state.setReach));

    // TIMELINE_ALL_ALL
    const { result: result1 } = renderHook(() => useStreamIdFromFilters());
    expect(result1.current).toBe(Core.PostStreamTypes.TIMELINE_ALL_ALL);

    // TIMELINE_FOLLOWING_ALL
    setReach.current(Core.REACH.FOLLOWING);
    const { result: result2 } = renderHook(() => useStreamIdFromFilters());
    expect(result2.current).toBe(Core.PostStreamTypes.TIMELINE_FOLLOWING_ALL);

    // TIMELINE_FRIENDS_ALL
    setReach.current(Core.REACH.FRIENDS);
    const { result: result3 } = renderHook(() => useStreamIdFromFilters());
    expect(result3.current).toBe(Core.PostStreamTypes.TIMELINE_FRIENDS_ALL);

    // TIMELINE_ALL_IMAGE
    setReach.current(Core.REACH.ALL);
    const { result: setContent } = renderHook(() => Core.useHomeStore((state) => state.setContent));
    setContent.current(Core.CONTENT.IMAGES);
    const { result: result4 } = renderHook(() => useStreamIdFromFilters());
    expect(result4.current).toBe(Core.PostStreamTypes.TIMELINE_ALL_IMAGE);
  });

  it('should return PostStreamTypes enum for all valid combinations', () => {
    const { result: setSort } = renderHook(() => Core.useHomeStore((state) => state.setSort));
    const { result: setContent } = renderHook(() => Core.useHomeStore((state) => state.setContent));

    // Set combination - all should be in enum
    setSort.current(Core.SORT.ENGAGEMENT);
    setContent.current(Core.CONTENT.LONG);

    const { result } = renderHook(() => useStreamIdFromFilters());
    expect(result.current).toBe(Core.PostStreamTypes.POPULARITY_ALL_LONG);
    expect(result.current).toBe('total_engagement:all:long');
  });

  it('should handle all reach options', () => {
    const { result: setReach } = renderHook(() => Core.useHomeStore((state) => state.setReach));

    // Test each reach option
    const reachOptions = [
      { reach: Core.REACH.ALL, expected: 'timeline:all:all' },
      { reach: Core.REACH.FOLLOWING, expected: 'timeline:following:all' },
      { reach: Core.REACH.FRIENDS, expected: 'timeline:friends:all' },
    ];

    reachOptions.forEach(({ reach, expected }) => {
      setReach.current(reach);
      const { result } = renderHook(() => useStreamIdFromFilters());
      expect(result.current).toBe(expected);
    });
  });

  it('should handle all content types', () => {
    const { result: setContent } = renderHook(() => Core.useHomeStore((state) => state.setContent));

    const contentOptions = [
      { content: Core.CONTENT.ALL, expected: 'timeline:all:all' },
      { content: Core.CONTENT.SHORT, expected: 'timeline:all:short' },
      { content: Core.CONTENT.LONG, expected: 'timeline:all:long' },
      { content: Core.CONTENT.IMAGES, expected: 'timeline:all:image' },
      { content: Core.CONTENT.VIDEOS, expected: 'timeline:all:video' },
      { content: Core.CONTENT.LINKS, expected: 'timeline:all:link' },
      { content: Core.CONTENT.FILES, expected: 'timeline:all:file' },
    ];

    contentOptions.forEach(({ content, expected }) => {
      setContent.current(content);
      const { result } = renderHook(() => useStreamIdFromFilters());
      expect(result.current).toBe(expected);
    });
  });

  it('should reflect store state changes immediately', () => {
    const { result: streamIdResult, rerender } = renderHook(() => useStreamIdFromFilters());
    const { result: homeStore } = renderHook(() => Core.useHomeStore());

    expect(streamIdResult.current).toBe('timeline:all:all');

    // Change filter through store
    homeStore.current.setSort(Core.SORT.ENGAGEMENT);
    rerender();

    // Hook should reflect new state
    expect(streamIdResult.current).toBe('total_engagement:all:all');
  });
});
