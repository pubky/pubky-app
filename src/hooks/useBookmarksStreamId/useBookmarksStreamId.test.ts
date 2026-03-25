import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import * as Core from '@/core';
import { useBookmarksStreamId } from './useBookmarksStreamId';

describe('useBookmarksStreamId', () => {
  beforeEach(() => {
    // Reset store to default state before each test
    act(() => {
      Core.useHomeStore.setState({
        sort: Core.SORT.TIMELINE,
        content: Core.CONTENT.ALL,
      });
    });
  });

  describe('with TIMELINE sort', () => {
    it('should return TIMELINE_BOOKMARKS_ALL for default filters', () => {
      const { result } = renderHook(() => useBookmarksStreamId());
      expect(result.current).toBe(Core.PostStreamTypes.TIMELINE_BOOKMARKS_ALL);
    });

    it('should return TIMELINE_BOOKMARKS_SHORT for short content', () => {
      act(() => {
        Core.useHomeStore.setState({ content: Core.CONTENT.SHORT });
      });
      const { result } = renderHook(() => useBookmarksStreamId());
      expect(result.current).toBe(Core.PostStreamTypes.TIMELINE_BOOKMARKS_SHORT);
    });

    it('should return TIMELINE_BOOKMARKS_LONG for long content', () => {
      act(() => {
        Core.useHomeStore.setState({ content: Core.CONTENT.LONG });
      });
      const { result } = renderHook(() => useBookmarksStreamId());
      expect(result.current).toBe(Core.PostStreamTypes.TIMELINE_BOOKMARKS_LONG);
    });

    it('should return TIMELINE_BOOKMARKS_IMAGE for images content', () => {
      act(() => {
        Core.useHomeStore.setState({ content: Core.CONTENT.IMAGES });
      });
      const { result } = renderHook(() => useBookmarksStreamId());
      expect(result.current).toBe(Core.PostStreamTypes.TIMELINE_BOOKMARKS_IMAGE);
    });

    it('should return TIMELINE_BOOKMARKS_VIDEO for videos content', () => {
      act(() => {
        Core.useHomeStore.setState({ content: Core.CONTENT.VIDEOS });
      });
      const { result } = renderHook(() => useBookmarksStreamId());
      expect(result.current).toBe(Core.PostStreamTypes.TIMELINE_BOOKMARKS_VIDEO);
    });

    it('should return TIMELINE_BOOKMARKS_LINK for links content', () => {
      act(() => {
        Core.useHomeStore.setState({ content: Core.CONTENT.LINKS });
      });
      const { result } = renderHook(() => useBookmarksStreamId());
      expect(result.current).toBe(Core.PostStreamTypes.TIMELINE_BOOKMARKS_LINK);
    });

    it('should return TIMELINE_BOOKMARKS_FILE for files content', () => {
      act(() => {
        Core.useHomeStore.setState({ content: Core.CONTENT.FILES });
      });
      const { result } = renderHook(() => useBookmarksStreamId());
      expect(result.current).toBe(Core.PostStreamTypes.TIMELINE_BOOKMARKS_FILE);
    });
  });

  describe('with ENGAGEMENT sort', () => {
    beforeEach(() => {
      act(() => {
        Core.useHomeStore.setState({ sort: Core.SORT.ENGAGEMENT });
      });
    });

    it('should return POPULARITY_BOOKMARKS_ALL for all content', () => {
      const { result } = renderHook(() => useBookmarksStreamId());
      expect(result.current).toBe(Core.PostStreamTypes.POPULARITY_BOOKMARKS_ALL);
    });

    it('should return POPULARITY_BOOKMARKS_SHORT for short content', () => {
      act(() => {
        Core.useHomeStore.setState({ content: Core.CONTENT.SHORT });
      });
      const { result } = renderHook(() => useBookmarksStreamId());
      expect(result.current).toBe(Core.PostStreamTypes.POPULARITY_BOOKMARKS_SHORT);
    });

    it('should return POPULARITY_BOOKMARKS_LONG for long content', () => {
      act(() => {
        Core.useHomeStore.setState({ content: Core.CONTENT.LONG });
      });
      const { result } = renderHook(() => useBookmarksStreamId());
      expect(result.current).toBe(Core.PostStreamTypes.POPULARITY_BOOKMARKS_LONG);
    });

    it('should return POPULARITY_BOOKMARKS_IMAGE for images content', () => {
      act(() => {
        Core.useHomeStore.setState({ content: Core.CONTENT.IMAGES });
      });
      const { result } = renderHook(() => useBookmarksStreamId());
      expect(result.current).toBe(Core.PostStreamTypes.POPULARITY_BOOKMARKS_IMAGE);
    });

    it('should return POPULARITY_BOOKMARKS_VIDEO for videos content', () => {
      act(() => {
        Core.useHomeStore.setState({ content: Core.CONTENT.VIDEOS });
      });
      const { result } = renderHook(() => useBookmarksStreamId());
      expect(result.current).toBe(Core.PostStreamTypes.POPULARITY_BOOKMARKS_VIDEO);
    });

    it('should return POPULARITY_BOOKMARKS_LINK for links content', () => {
      act(() => {
        Core.useHomeStore.setState({ content: Core.CONTENT.LINKS });
      });
      const { result } = renderHook(() => useBookmarksStreamId());
      expect(result.current).toBe(Core.PostStreamTypes.POPULARITY_BOOKMARKS_LINK);
    });

    it('should return POPULARITY_BOOKMARKS_FILE for files content', () => {
      act(() => {
        Core.useHomeStore.setState({ content: Core.CONTENT.FILES });
      });
      const { result } = renderHook(() => useBookmarksStreamId());
      expect(result.current).toBe(Core.PostStreamTypes.POPULARITY_BOOKMARKS_FILE);
    });
  });

  it('prefers the provided content override over store content', () => {
    act(() => {
      Core.useHomeStore.setState({
        sort: Core.SORT.TIMELINE,
        content: Core.CONTENT.SHORT,
      });
    });

    const { result } = renderHook(() => useBookmarksStreamId(Core.CONTENT.ALL));

    expect(result.current).toBe(Core.PostStreamTypes.TIMELINE_BOOKMARKS_ALL);
  });
});
