import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getMaxStreamTags } from '@/libs/runtime-config/runtime-config';
import { useTagSearch } from './useTagSearch';
import { buildSearchUrl } from './useTagSearch.utils';

// Mock next/navigation
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Mock the search store
const mockSetActiveTags = vi.fn();
const mockRemoveActiveTag = vi.fn();
const mockAddTag = vi.fn();
let mockActiveTags: string[] = [];

vi.mock('@/stores/search/search.store', () => ({
  useSearchStore: () => ({
    activeTags: mockActiveTags,
    setActiveTags: mockSetActiveTags,
    removeActiveTag: mockRemoveActiveTag,
    addTag: mockAddTag,
  }),
}));

describe('useTagSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockActiveTags = [];
  });

  describe('buildSearchUrl utility', () => {
    it('returns search route for empty tags', () => {
      expect(buildSearchUrl([])).toBe('/search');
    });

    it('builds URL with single tag', () => {
      expect(buildSearchUrl(['react'])).toBe('/search?tags=react');
    });

    it('builds URL with multiple tags', () => {
      expect(buildSearchUrl(['react', 'typescript'])).toBe('/search?tags=react,typescript');
    });

    it('encodes tags as provided (normalization should happen before calling)', () => {
      expect(buildSearchUrl(['react', 'typescript'])).toBe('/search?tags=react,typescript');
    });

    it('encodes special characters', () => {
      expect(buildSearchUrl(['c++', 'node.js'])).toBe('/search?tags=c%2B%2B,node.js');
    });
  });

  describe('addTagToSearch', () => {
    it('adds tag to existing tags', () => {
      mockActiveTags = ['react'];
      const { result } = renderHook(() => useTagSearch());

      act(() => {
        result.current.addTagToSearch('typescript');
      });

      expect(mockSetActiveTags).toHaveBeenCalledWith(['react', 'typescript']);
      expect(mockPush).toHaveBeenCalledWith('/search?tags=react,typescript');
    });

    it('does nothing for empty tag', () => {
      const { result } = renderHook(() => useTagSearch());

      act(() => {
        result.current.addTagToSearch('');
      });

      expect(mockSetActiveTags).not.toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalled();
    });

    it('adds to recent when addToRecent option is true', () => {
      const { result } = renderHook(() => useTagSearch());

      act(() => {
        result.current.addTagToSearch('react', { addToRecent: true });
      });

      expect(mockAddTag).toHaveBeenCalledWith('react');
    });

    it('handles adding first tag', () => {
      mockActiveTags = [];
      const { result } = renderHook(() => useTagSearch());

      act(() => {
        result.current.addTagToSearch('react');
      });

      expect(mockSetActiveTags).toHaveBeenCalledWith(['react']);
      expect(mockPush).toHaveBeenCalledWith('/search?tags=react');
    });

    it('keeps every existing tag while below the stream tag limit', () => {
      mockActiveTags = Array.from({ length: getMaxStreamTags() - 1 }, (_, i) => `tag${i + 1}`);
      const { result } = renderHook(() => useTagSearch());

      act(() => {
        result.current.addTagToSearch('extra');
      });

      expect(mockPush).toHaveBeenCalledWith(buildSearchUrl([...mockActiveTags, 'extra']));
    });

    it('drops the oldest tag when adding at the stream tag limit', () => {
      mockActiveTags = Array.from({ length: getMaxStreamTags() }, (_, i) => `tag${i + 1}`);
      const { result } = renderHook(() => useTagSearch());

      act(() => {
        result.current.addTagToSearch('extra');
      });

      expect(mockPush).toHaveBeenCalledWith(buildSearchUrl([...mockActiveTags.slice(1), 'extra']));
    });
  });

  describe('removeTagFromSearch', () => {
    it('removes tag and navigates with remaining tags', () => {
      mockActiveTags = ['react', 'typescript'];
      const { result } = renderHook(() => useTagSearch());

      act(() => {
        result.current.removeTagFromSearch('react');
      });

      expect(mockRemoveActiveTag).toHaveBeenCalledWith('react');
      expect(mockPush).toHaveBeenCalledWith('/search?tags=typescript');
    });

    it('removes only the clicked tag from a search at the stream tag limit', () => {
      mockActiveTags = Array.from({ length: getMaxStreamTags() }, (_, i) => `tag${i + 1}`);
      const { result } = renderHook(() => useTagSearch());

      act(() => {
        result.current.removeTagFromSearch('tag1');
      });

      expect(mockPush).toHaveBeenCalledWith(buildSearchUrl(mockActiveTags.slice(1)));
    });

    it('lands on the /search empty state when removing the last tag', () => {
      // Same destination as clearing the search from the bar's X — the two
      // "search is now empty" paths must not diverge.
      mockActiveTags = ['react'];
      const { result } = renderHook(() => useTagSearch());

      act(() => {
        result.current.removeTagFromSearch('react');
      });

      expect(mockRemoveActiveTag).toHaveBeenCalledWith('react');
      expect(mockPush).toHaveBeenCalledWith('/search');
    });

    it('normalizes tag before removing', () => {
      mockActiveTags = ['react'];
      const { result } = renderHook(() => useTagSearch());

      act(() => {
        result.current.removeTagFromSearch('  React  ');
      });

      expect(mockRemoveActiveTag).toHaveBeenCalledWith('react');
    });
  });

  describe('activeTags', () => {
    it('returns current active tags from store', () => {
      mockActiveTags = ['react', 'typescript'];
      const { result } = renderHook(() => useTagSearch());

      expect(result.current.activeTags).toEqual(['react', 'typescript']);
    });
  });
});
