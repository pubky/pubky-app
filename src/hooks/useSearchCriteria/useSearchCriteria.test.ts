import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSearchCriteria } from './useSearchCriteria';

// Mock next/navigation
const mockGet = vi.fn();
const mockQueryParam = vi.hoisted(() => ({ value: null as string | null }));
vi.mock('next/navigation', () => ({
  useSearchParams: () => ({
    get: (key: string) => (key === 'q' ? mockQueryParam.value : mockGet(key)),
  }),
}));

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

    it('lowercases tags — the store, chips, and stream ids all assume lowercase', () => {
      mockGet.mockReturnValue('Bitcoin,NOSTR');
      const { result } = renderHook(() => useSearchCriteria());
      expect(result.current).toEqual({ mode: 'tags', tags: ['bitcoin', 'nostr'] });
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
