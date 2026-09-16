import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useHomeStore } from '@/stores/home/home.store';
import { CONTENT, SORT } from '@/stores/home/home.types';
import { useSearchStreamId } from './useSearchStreamId';

// Mock next/navigation
const mockGet = vi.fn();
const mockQueryParam = vi.hoisted(() => ({ value: null as string | null }));
vi.mock('next/navigation', () => ({
  useSearchParams: () => ({
    get: (key: string) => (key === 'q' ? mockQueryParam.value : mockGet(key)),
  }),
}));

describe('useSearchStreamId', () => {
  beforeEach(() => {
    // Reset mocks and store to default state before each test
    mockGet.mockReset();
    mockQueryParam.value = null;
    act(() => {
      useHomeStore.setState({
        sort: SORT.TIMELINE,
        content: CONTENT.ALL,
      });
    });
  });

  describe('when no tags in URL', () => {
    it('should return undefined when tags param is null', () => {
      mockGet.mockReturnValue(null);
      const { result } = renderHook(() => useSearchStreamId());
      expect(result.current).toBeUndefined();
    });

    it('should return undefined when tags param is empty string', () => {
      mockGet.mockReturnValue('');
      const { result } = renderHook(() => useSearchStreamId());
      expect(result.current).toBeUndefined();
    });

    it('should return undefined when tags param is whitespace only', () => {
      mockGet.mockReturnValue('   ');
      const { result } = renderHook(() => useSearchStreamId());
      expect(result.current).toBeUndefined();
    });
  });

  describe('when a content query is provided', () => {
    it('takes precedence over tags and maps the content filter into the search stream', () => {
      mockQueryParam.value = 'bitcoin wallets';
      mockGet.mockReturnValue('tag-that-must-not-win');
      act(() => {
        useHomeStore.setState({ content: CONTENT.COLLECTIONS });
      });

      const { result, rerender } = renderHook(() => useSearchStreamId());

      expect(result.current).toBe('content_search:q~bitcoin%20wallets:collection');

      mockQueryParam.value = 'privacy tools';
      rerender();
      expect(result.current).toBe('content_search:q~privacy%20tools:collection');
    });
  });

  describe('when tags are provided in URL', () => {
    it('should return stream ID with single tag', () => {
      mockGet.mockReturnValue('pubky');
      const { result } = renderHook(() => useSearchStreamId());
      expect(result.current).toBe('timeline:all:all:pubky');
    });

    it('should return stream ID with multiple tags', () => {
      mockGet.mockReturnValue('pubky,bitcoin,nostr');
      const { result } = renderHook(() => useSearchStreamId());
      expect(result.current).toBe('timeline:all:all:pubky,bitcoin,nostr');
    });

    it('should trim whitespace from tags', () => {
      mockGet.mockReturnValue(' pubky , bitcoin , nostr ');
      const { result } = renderHook(() => useSearchStreamId());
      expect(result.current).toBe('timeline:all:all:pubky,bitcoin,nostr');
    });

    it('should lowercase tags so shared uppercase URLs hit the same stream cache', () => {
      mockGet.mockReturnValue('Bitcoin,NOSTR');
      const { result } = renderHook(() => useSearchStreamId());
      expect(result.current).toBe('timeline:all:all:bitcoin,nostr');
    });

    it('should filter out empty tags', () => {
      mockGet.mockReturnValue('pubky,,bitcoin,,,nostr');
      const { result } = renderHook(() => useSearchStreamId());
      expect(result.current).toBe('timeline:all:all:pubky,bitcoin,nostr');
    });

    it('should limit tags to MAX_STREAM_TAGS', () => {
      // Default MAX_STREAM_TAGS is 5
      mockGet.mockReturnValue('tag1,tag2,tag3,tag4,tag5,tag6,tag7');
      const { result } = renderHook(() => useSearchStreamId());
      expect(result.current).toBe('timeline:all:all:tag1,tag2,tag3,tag4,tag5');
    });
  });

  describe('with different sort filters', () => {
    it('should use engagement sorting when sort is ENGAGEMENT', () => {
      mockGet.mockReturnValue('pubky');
      act(() => {
        useHomeStore.setState({ sort: SORT.ENGAGEMENT });
      });
      const { result } = renderHook(() => useSearchStreamId());
      expect(result.current).toBe('total_engagement:all:all:pubky');
    });

    it('should use timeline sorting when sort is TIMELINE', () => {
      mockGet.mockReturnValue('pubky');
      act(() => {
        useHomeStore.setState({ sort: SORT.TIMELINE });
      });
      const { result } = renderHook(() => useSearchStreamId());
      expect(result.current).toBe('timeline:all:all:pubky');
    });
  });

  describe('with different content filters', () => {
    it('should use short kind for SHORT content', () => {
      mockGet.mockReturnValue('pubky');
      act(() => {
        useHomeStore.setState({ content: CONTENT.SHORT });
      });
      const { result } = renderHook(() => useSearchStreamId());
      expect(result.current).toBe('timeline:all:short:pubky');
    });

    it('should use long kind for LONG content', () => {
      mockGet.mockReturnValue('pubky');
      act(() => {
        useHomeStore.setState({ content: CONTENT.LONG });
      });
      const { result } = renderHook(() => useSearchStreamId());
      expect(result.current).toBe('timeline:all:long:pubky');
    });

    it('should use image kind for IMAGES content', () => {
      mockGet.mockReturnValue('pubky');
      act(() => {
        useHomeStore.setState({ content: CONTENT.IMAGES });
      });
      const { result } = renderHook(() => useSearchStreamId());
      expect(result.current).toBe('timeline:all:image:pubky');
    });

    it('should use video kind for VIDEOS content', () => {
      mockGet.mockReturnValue('pubky');
      act(() => {
        useHomeStore.setState({ content: CONTENT.VIDEOS });
      });
      const { result } = renderHook(() => useSearchStreamId());
      expect(result.current).toBe('timeline:all:video:pubky');
    });

    it('should use link kind for LINKS content', () => {
      mockGet.mockReturnValue('pubky');
      act(() => {
        useHomeStore.setState({ content: CONTENT.LINKS });
      });
      const { result } = renderHook(() => useSearchStreamId());
      expect(result.current).toBe('timeline:all:link:pubky');
    });

    it('should use file kind for FILES content', () => {
      mockGet.mockReturnValue('pubky');
      act(() => {
        useHomeStore.setState({ content: CONTENT.FILES });
      });
      const { result } = renderHook(() => useSearchStreamId());
      expect(result.current).toBe('timeline:all:file:pubky');
    });

    it('should use collection kind for COLLECTIONS content', () => {
      mockGet.mockReturnValue('pubky');
      act(() => {
        useHomeStore.setState({ content: CONTENT.COLLECTIONS });
      });
      const { result } = renderHook(() => useSearchStreamId());
      expect(result.current).toBe('timeline:all:collection:pubky');
    });
  });

  describe('with combined filters', () => {
    it('should combine engagement sort with image content', () => {
      mockGet.mockReturnValue('pubky,bitcoin');
      act(() => {
        useHomeStore.setState({
          sort: SORT.ENGAGEMENT,
          content: CONTENT.IMAGES,
        });
      });
      const { result } = renderHook(() => useSearchStreamId());
      expect(result.current).toBe('total_engagement:all:image:pubky,bitcoin');
    });
  });
});
