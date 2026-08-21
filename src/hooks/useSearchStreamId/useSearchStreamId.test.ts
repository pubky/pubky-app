import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useHomeStore } from '@/stores/home/home.store';
import { CONTENT, SORT } from '@/stores/home/home.types';
import { useSearchCriteria, useSearchStreamId } from './useSearchStreamId';

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

describe('useSearchCriteria', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockGet.mockReturnValue(null);
    mockQueryParam.value = null;
  });

  describe('content mode', () => {
    it('returns content mode with a trimmed query for a valid q param', () => {
      mockQueryParam.value = '  bitcoin wallet  ';
      const { result } = renderHook(() => useSearchCriteria());
      expect(result.current).toEqual({ mode: 'content', query: 'bitcoin wallet' });
    });

    it('wins over tags when both q and tags are present', () => {
      mockQueryParam.value = 'bitcoin';
      mockGet.mockReturnValue('pubky,nostr');
      const { result } = renderHook(() => useSearchCriteria());
      expect(result.current).toEqual({ mode: 'content', query: 'bitcoin' });
    });
  });

  describe('invalid mode', () => {
    it('returns invalid mode with a message when q is too short', () => {
      mockQueryParam.value = 'b';
      const { result } = renderHook(() => useSearchCriteria());
      expect(result.current).toEqual({ mode: 'invalid', message: 'Search must be at least 2 characters', query: 'b' });
    });

    it('returns invalid mode with a message when q is too long', () => {
      mockQueryParam.value = 'a'.repeat(31);
      const { result } = renderHook(() => useSearchCriteria());
      expect(result.current).toEqual({
        mode: 'invalid',
        message: 'Search can be max 30 characters',
        query: 'a'.repeat(31),
      });
    });

    it('returns invalid mode with a message when q has too many terms', () => {
      mockQueryParam.value = 'one two three four five';
      const { result } = renderHook(() => useSearchCriteria());
      expect(result.current).toEqual({
        mode: 'invalid',
        message: 'Search can contain up to 4 terms',
        query: 'one two three four five',
      });
    });

    it('wins over tags when an invalid q is present', () => {
      mockQueryParam.value = 'b';
      mockGet.mockReturnValue('pubky');
      const { result } = renderHook(() => useSearchCriteria());
      expect(result.current).toEqual({ mode: 'invalid', message: 'Search must be at least 2 characters', query: 'b' });
    });
  });

  describe('tags mode', () => {
    it('falls back to tags when q is blank', () => {
      mockQueryParam.value = '   ';
      mockGet.mockReturnValue('pubky,bitcoin');
      const { result } = renderHook(() => useSearchCriteria());
      expect(result.current).toEqual({ mode: 'tags', tags: ['pubky', 'bitcoin'] });
    });

    it('trims whitespace and filters out empty tags', () => {
      mockGet.mockReturnValue(' pubky ,, bitcoin ,,, nostr ');
      const { result } = renderHook(() => useSearchCriteria());
      expect(result.current).toEqual({ mode: 'tags', tags: ['pubky', 'bitcoin', 'nostr'] });
    });

    it('limits tags to MAX_STREAM_TAGS', () => {
      // Default MAX_STREAM_TAGS is 5
      mockGet.mockReturnValue('tag1,tag2,tag3,tag4,tag5,tag6,tag7');
      const { result } = renderHook(() => useSearchCriteria());
      expect(result.current).toEqual({ mode: 'tags', tags: ['tag1', 'tag2', 'tag3', 'tag4', 'tag5'] });
    });
  });

  describe('none mode', () => {
    it('returns none when neither q nor tags are present', () => {
      const { result } = renderHook(() => useSearchCriteria());
      expect(result.current).toEqual({ mode: 'none' });
    });

    it('returns none when tags param is whitespace only', () => {
      mockGet.mockReturnValue('   ');
      const { result } = renderHook(() => useSearchCriteria());
      expect(result.current).toEqual({ mode: 'none' });
    });
  });
});
