import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useBookmarksStreamId } from './useBookmarksStreamId';
import { PostStreamTypes } from '@/models/stream/post/postStream.types';
import { useHomeStore } from '@/stores/home/home.store';
import { CONTENT, SORT } from '@/stores/home/home.types';
describe('useBookmarksStreamId', () => {
  beforeEach(() => {
    // Reset store to default state before each test
    act(() => {
      useHomeStore.setState({
        sort: SORT.TIMELINE,
        content: CONTENT.ALL,
      });
    });
  });

  describe('with TIMELINE sort', () => {
    it('should return TIMELINE_BOOKMARKS_ALL for default filters', () => {
      const { result } = renderHook(() => useBookmarksStreamId());
      expect(result.current).toBe(PostStreamTypes.TIMELINE_BOOKMARKS_ALL);
    });

    it('should return TIMELINE_BOOKMARKS_SHORT for short content', () => {
      act(() => {
        useHomeStore.setState({ content: CONTENT.SHORT });
      });
      const { result } = renderHook(() => useBookmarksStreamId());
      expect(result.current).toBe(PostStreamTypes.TIMELINE_BOOKMARKS_SHORT);
    });

    it('should return TIMELINE_BOOKMARKS_LONG for long content', () => {
      act(() => {
        useHomeStore.setState({ content: CONTENT.LONG });
      });
      const { result } = renderHook(() => useBookmarksStreamId());
      expect(result.current).toBe(PostStreamTypes.TIMELINE_BOOKMARKS_LONG);
    });

    it('should return TIMELINE_BOOKMARKS_IMAGE for images content', () => {
      act(() => {
        useHomeStore.setState({ content: CONTENT.IMAGES });
      });
      const { result } = renderHook(() => useBookmarksStreamId());
      expect(result.current).toBe(PostStreamTypes.TIMELINE_BOOKMARKS_IMAGE);
    });

    it('should return TIMELINE_BOOKMARKS_VIDEO for videos content', () => {
      act(() => {
        useHomeStore.setState({ content: CONTENT.VIDEOS });
      });
      const { result } = renderHook(() => useBookmarksStreamId());
      expect(result.current).toBe(PostStreamTypes.TIMELINE_BOOKMARKS_VIDEO);
    });

    it('should return TIMELINE_BOOKMARKS_LINK for links content', () => {
      act(() => {
        useHomeStore.setState({ content: CONTENT.LINKS });
      });
      const { result } = renderHook(() => useBookmarksStreamId());
      expect(result.current).toBe(PostStreamTypes.TIMELINE_BOOKMARKS_LINK);
    });

    it('should return TIMELINE_BOOKMARKS_FILE for files content', () => {
      act(() => {
        useHomeStore.setState({ content: CONTENT.FILES });
      });
      const { result } = renderHook(() => useBookmarksStreamId());
      expect(result.current).toBe(PostStreamTypes.TIMELINE_BOOKMARKS_FILE);
    });
  });

  describe('with ENGAGEMENT sort', () => {
    beforeEach(() => {
      act(() => {
        useHomeStore.setState({ sort: SORT.ENGAGEMENT });
      });
    });

    it('should return POPULARITY_BOOKMARKS_ALL for all content', () => {
      const { result } = renderHook(() => useBookmarksStreamId());
      expect(result.current).toBe(PostStreamTypes.POPULARITY_BOOKMARKS_ALL);
    });

    it('should return POPULARITY_BOOKMARKS_SHORT for short content', () => {
      act(() => {
        useHomeStore.setState({ content: CONTENT.SHORT });
      });
      const { result } = renderHook(() => useBookmarksStreamId());
      expect(result.current).toBe(PostStreamTypes.POPULARITY_BOOKMARKS_SHORT);
    });

    it('should return POPULARITY_BOOKMARKS_LONG for long content', () => {
      act(() => {
        useHomeStore.setState({ content: CONTENT.LONG });
      });
      const { result } = renderHook(() => useBookmarksStreamId());
      expect(result.current).toBe(PostStreamTypes.POPULARITY_BOOKMARKS_LONG);
    });

    it('should return POPULARITY_BOOKMARKS_IMAGE for images content', () => {
      act(() => {
        useHomeStore.setState({ content: CONTENT.IMAGES });
      });
      const { result } = renderHook(() => useBookmarksStreamId());
      expect(result.current).toBe(PostStreamTypes.POPULARITY_BOOKMARKS_IMAGE);
    });

    it('should return POPULARITY_BOOKMARKS_VIDEO for videos content', () => {
      act(() => {
        useHomeStore.setState({ content: CONTENT.VIDEOS });
      });
      const { result } = renderHook(() => useBookmarksStreamId());
      expect(result.current).toBe(PostStreamTypes.POPULARITY_BOOKMARKS_VIDEO);
    });

    it('should return POPULARITY_BOOKMARKS_LINK for links content', () => {
      act(() => {
        useHomeStore.setState({ content: CONTENT.LINKS });
      });
      const { result } = renderHook(() => useBookmarksStreamId());
      expect(result.current).toBe(PostStreamTypes.POPULARITY_BOOKMARKS_LINK);
    });

    it('should return POPULARITY_BOOKMARKS_FILE for files content', () => {
      act(() => {
        useHomeStore.setState({ content: CONTENT.FILES });
      });
      const { result } = renderHook(() => useBookmarksStreamId());
      expect(result.current).toBe(PostStreamTypes.POPULARITY_BOOKMARKS_FILE);
    });
  });

  it('prefers the provided content override over store content', () => {
    act(() => {
      useHomeStore.setState({
        sort: SORT.TIMELINE,
        content: CONTENT.SHORT,
      });
    });

    const { result } = renderHook(() => useBookmarksStreamId(CONTENT.ALL));

    expect(result.current).toBe(PostStreamTypes.TIMELINE_BOOKMARKS_ALL);
  });
});
