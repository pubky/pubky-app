import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePostNavigation } from './usePostNavigation';

// Mock next/navigation
const mockPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

describe('usePostNavigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('navigateToPost', () => {
    it('should return navigateToPost function', () => {
      const { result } = renderHook(() => usePostNavigation());

      expect(result.current.navigateToPost).toBeDefined();
      expect(typeof result.current.navigateToPost).toBe('function');
    });

    it('should navigate to post detail page with composite ID', () => {
      const { result } = renderHook(() => usePostNavigation());
      const compositePostId = 'author123:post456';

      act(() => {
        result.current.navigateToPost(compositePostId);
      });

      expect(mockPush).toHaveBeenCalledWith('/post/author123/post456');
      expect(mockPush).toHaveBeenCalledTimes(1);
    });

    it('should handle multiple navigation calls', () => {
      const { result } = renderHook(() => usePostNavigation());
      const postId1 = 'author1:post1';
      const postId2 = 'author2:post2';
      const postId3 = 'author3:post3';

      act(() => {
        result.current.navigateToPost(postId1);
        result.current.navigateToPost(postId2);
        result.current.navigateToPost(postId3);
      });

      expect(mockPush).toHaveBeenCalledTimes(3);
      expect(mockPush).toHaveBeenNthCalledWith(1, '/post/author1/post1');
      expect(mockPush).toHaveBeenNthCalledWith(2, '/post/author2/post2');
      expect(mockPush).toHaveBeenNthCalledWith(3, '/post/author3/post3');
    });

    it('should handle post IDs with special characters', () => {
      const { result } = renderHook(() => usePostNavigation());
      const specialPostId = 'author-special_123:post-with_special-chars_456';

      act(() => {
        result.current.navigateToPost(specialPostId);
      });

      expect(mockPush).toHaveBeenCalledWith('/post/author-special_123/post-with_special-chars_456');
    });

    it('should handle long post IDs', () => {
      const { result } = renderHook(() => usePostNavigation());
      const longPostId = 'verylongauthorid1234567890abcdef:verylongpostid0987654321fedcba';

      act(() => {
        result.current.navigateToPost(longPostId);
      });

      expect(mockPush).toHaveBeenCalledWith('/post/verylongauthorid1234567890abcdef/verylongpostid0987654321fedcba');
    });

    it('should provide navigateToPost function', () => {
      const { result } = renderHook(() => usePostNavigation());

      const navigateToPost = result.current.navigateToPost;

      // Function should be defined and callable
      expect(navigateToPost).toBeDefined();
      expect(typeof navigateToPost).toBe('function');
    });
  });

  describe('Integration', () => {
    it('should work correctly when used multiple times in different components', () => {
      const { result: result1 } = renderHook(() => usePostNavigation());
      const { result: result2 } = renderHook(() => usePostNavigation());

      const postId1 = 'author1:post1';
      const postId2 = 'author2:post2';

      act(() => {
        result1.current.navigateToPost(postId1);
        result2.current.navigateToPost(postId2);
      });

      expect(mockPush).toHaveBeenCalledTimes(2);
      expect(mockPush).toHaveBeenNthCalledWith(1, '/post/author1/post1');
      expect(mockPush).toHaveBeenNthCalledWith(2, '/post/author2/post2');
    });

    it('should handle rapid successive calls', () => {
      const { result } = renderHook(() => usePostNavigation());

      act(() => {
        for (let i = 0; i < 10; i++) {
          result.current.navigateToPost(`author${i}:post${i}`);
        }
      });

      expect(mockPush).toHaveBeenCalledTimes(10);
    });
  });

  describe('Edge Cases', () => {
    it('should throw error for empty string post ID', () => {
      const { result } = renderHook(() => usePostNavigation());

      expect(() => {
        act(() => {
          result.current.navigateToPost('');
        });
      }).toThrow('Invalid composite id');
    });

    it('should throw error for post ID with only colon', () => {
      const { result } = renderHook(() => usePostNavigation());

      expect(() => {
        act(() => {
          result.current.navigateToPost(':');
        });
      }).toThrow('Invalid composite id');
    });

    it('should handle post ID with multiple colons', () => {
      const { result } = renderHook(() => usePostNavigation());
      const postIdWithMultipleColons = 'author:123';

      act(() => {
        result.current.navigateToPost(postIdWithMultipleColons);
      });

      // Split takes the first part as userId and the second as pId
      expect(mockPush).toHaveBeenCalledWith('/post/author/123');
    });

    it('should handle post ID with URL encoding characters', () => {
      const { result } = renderHook(() => usePostNavigation());
      const postIdWithEncoding = 'author%20test:post%20id';

      act(() => {
        result.current.navigateToPost(postIdWithEncoding);
      });

      expect(mockPush).toHaveBeenCalledWith('/post/author%20test/post%20id');
    });
  });
});
