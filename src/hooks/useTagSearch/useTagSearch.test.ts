import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useTagSearch } from './useTagSearch';
import { buildSearchUrl } from './useTagSearch.utils';
import { MAX_ACTIVE_SEARCH_TAGS } from '@/stores/search/search.constants';
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

    it('navigates to home when removing last tag', () => {
      mockActiveTags = ['react'];
      const { result } = renderHook(() => useTagSearch());

      act(() => {
        result.current.removeTagFromSearch('react');
      });

      expect(mockRemoveActiveTag).toHaveBeenCalledWith('react');
      expect(mockPush).toHaveBeenCalledWith('/home');
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

  describe('isReadOnly', () => {
    it('returns false when under max tags', () => {
      mockActiveTags = ['react'];
      const { result } = renderHook(() => useTagSearch());

      expect(result.current.isReadOnly).toBe(false);
    });

    it('returns true when at max tags', () => {
      mockActiveTags = Array(MAX_ACTIVE_SEARCH_TAGS).fill('tag');
      const { result } = renderHook(() => useTagSearch());

      expect(result.current.isReadOnly).toBe(true);
    });

    it('returns false when empty', () => {
      mockActiveTags = [];
      const { result } = renderHook(() => useTagSearch());

      expect(result.current.isReadOnly).toBe(false);
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
