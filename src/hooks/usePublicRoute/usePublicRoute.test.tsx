import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePublicRoute } from './usePublicRoute';

// Mock next/navigation
const mockPathname = vi.fn();
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname(),
}));

describe('usePublicRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('public routes', () => {
    it('returns isPublicRoute: true for single post page', () => {
      const pubky = 'gujx6qd8ksydh1makdphd3bxu351d9b8waqka8hfg6q7hnqkxexo';
      mockPathname.mockReturnValue(`/post/${pubky}/0034BBBDFK83G`);

      const { result } = renderHook(() => usePublicRoute());

      expect(result.current.isPublicRoute).toBe(true);
    });

    it('returns isPublicRoute: true for other user profile page', () => {
      const pubky = 'gujx6qd8ksydh1makdphd3bxu351d9b8waqka8hfg6q7hnqkxexo';
      mockPathname.mockReturnValue(`/profile/${pubky}`);

      const { result } = renderHook(() => usePublicRoute());

      expect(result.current.isPublicRoute).toBe(true);
    });

    it('returns isPublicRoute: true for other user profile sub-routes', () => {
      const pubky = 'gujx6qd8ksydh1makdphd3bxu351d9b8waqka8hfg6q7hnqkxexo';
      mockPathname.mockReturnValue(`/profile/${pubky}/posts`);

      const { result } = renderHook(() => usePublicRoute());

      expect(result.current.isPublicRoute).toBe(true);
    });
  });

  describe('non-public routes', () => {
    it('returns isPublicRoute: false for home page', () => {
      mockPathname.mockReturnValue('/home');

      const { result } = renderHook(() => usePublicRoute());

      expect(result.current.isPublicRoute).toBe(false);
    });

    it('returns isPublicRoute: false for own profile page', () => {
      mockPathname.mockReturnValue('/profile');

      const { result } = renderHook(() => usePublicRoute());

      expect(result.current.isPublicRoute).toBe(false);
    });

    it('returns isPublicRoute: false for own profile sub-routes', () => {
      mockPathname.mockReturnValue('/profile/posts');

      const { result } = renderHook(() => usePublicRoute());

      expect(result.current.isPublicRoute).toBe(false);
    });

    it('returns isPublicRoute: false for settings page', () => {
      mockPathname.mockReturnValue('/settings');

      const { result } = renderHook(() => usePublicRoute());

      expect(result.current.isPublicRoute).toBe(false);
    });

    it('returns isPublicRoute: false for root page', () => {
      mockPathname.mockReturnValue('/');

      const { result } = renderHook(() => usePublicRoute());

      expect(result.current.isPublicRoute).toBe(false);
    });
  });

  describe('memoization', () => {
    it('returns same reference when pathname does not change', () => {
      mockPathname.mockReturnValue('/home');

      const { result, rerender } = renderHook(() => usePublicRoute());
      const firstResult = result.current.isPublicRoute;

      rerender();

      expect(result.current.isPublicRoute).toBe(firstResult);
    });
  });
});
