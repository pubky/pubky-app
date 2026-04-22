import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useProfileNavigation } from './useProfileNavigation';
import { PROFILE_PAGE_TYPES } from '@/app/profile/types';
import { PROFILE_ROUTES } from '@/app';

// Mock Next.js navigation hooks
const mockPush = vi.fn();
const mockPathname = vi.fn();

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname(),
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Mock ProfileContext - default to own profile
const mockPubky = 'user123';
const mockIsOwnProfile = vi.fn(() => true);

vi.mock('@/providers', () => ({
  useProfileContext: () => ({
    pubky: mockPubky,
    isOwnProfile: mockIsOwnProfile(),
    isLoading: false,
  }),
}));

// Mock useIsMobile - default to desktop
const mockIsMobile = vi.fn(() => false);

vi.mock('@/hooks/useIsMobile', () => ({
  useIsMobile: () => mockIsMobile(),
}));

describe('useProfileNavigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default to notifications route, own profile, desktop
    mockPathname.mockReturnValue(PROFILE_ROUTES.PROFILE);
    mockIsOwnProfile.mockReturnValue(true);
    mockIsMobile.mockReturnValue(false);
  });

  describe('activePage', () => {
    it('should return NOTIFICATIONS for the base profile route', () => {
      mockPathname.mockReturnValue(PROFILE_ROUTES.PROFILE);

      const { result } = renderHook(() => useProfileNavigation());

      expect(result.current.activePage).toBe(PROFILE_PAGE_TYPES.NOTIFICATIONS);
    });

    it('should return NOTIFICATIONS for the notifications route', () => {
      mockPathname.mockReturnValue(PROFILE_ROUTES.NOTIFICATIONS);

      const { result } = renderHook(() => useProfileNavigation());

      expect(result.current.activePage).toBe(PROFILE_PAGE_TYPES.NOTIFICATIONS);
    });

    it('should return POSTS for the posts route', () => {
      mockPathname.mockReturnValue(PROFILE_ROUTES.POSTS);

      const { result } = renderHook(() => useProfileNavigation());

      expect(result.current.activePage).toBe(PROFILE_PAGE_TYPES.POSTS);
    });

    it('should return REPLIES for the replies route', () => {
      mockPathname.mockReturnValue(PROFILE_ROUTES.REPLIES);

      const { result } = renderHook(() => useProfileNavigation());

      expect(result.current.activePage).toBe(PROFILE_PAGE_TYPES.REPLIES);
    });

    it('should return FOLLOWERS for the followers route', () => {
      mockPathname.mockReturnValue(PROFILE_ROUTES.FOLLOWERS);

      const { result } = renderHook(() => useProfileNavigation());

      expect(result.current.activePage).toBe(PROFILE_PAGE_TYPES.FOLLOWERS);
    });

    it('should return FOLLOWING for the following route', () => {
      mockPathname.mockReturnValue(PROFILE_ROUTES.FOLLOWING);

      const { result } = renderHook(() => useProfileNavigation());

      expect(result.current.activePage).toBe(PROFILE_PAGE_TYPES.FOLLOWING);
    });

    it('should return FRIENDS for the friends route', () => {
      mockPathname.mockReturnValue(PROFILE_ROUTES.FRIENDS);

      const { result } = renderHook(() => useProfileNavigation());

      expect(result.current.activePage).toBe(PROFILE_PAGE_TYPES.FRIENDS);
    });

    it('should return UNIQUE_TAGS for the unique_tags route', () => {
      mockPathname.mockReturnValue(PROFILE_ROUTES.UNIQUE_TAGS);

      const { result } = renderHook(() => useProfileNavigation());

      expect(result.current.activePage).toBe(PROFILE_PAGE_TYPES.UNIQUE_TAGS);
    });

    it('should return PROFILE for the profile page route', () => {
      mockPathname.mockReturnValue(PROFILE_ROUTES.PROFILE_PAGE);

      const { result } = renderHook(() => useProfileNavigation());

      expect(result.current.activePage).toBe(PROFILE_PAGE_TYPES.PROFILE);
    });

    it('should default to NOTIFICATIONS for unknown routes', () => {
      mockPathname.mockReturnValue('/some/unknown/route');

      const { result } = renderHook(() => useProfileNavigation());

      expect(result.current.activePage).toBe(PROFILE_PAGE_TYPES.NOTIFICATIONS);
    });

    it('should update activePage when pathname changes', () => {
      mockPathname.mockReturnValue(PROFILE_ROUTES.POSTS);

      const { result, rerender } = renderHook(() => useProfileNavigation());

      expect(result.current.activePage).toBe(PROFILE_PAGE_TYPES.POSTS);

      // Change pathname
      mockPathname.mockReturnValue(PROFILE_ROUTES.REPLIES);
      rerender();

      expect(result.current.activePage).toBe(PROFILE_PAGE_TYPES.REPLIES);
    });
  });

  describe('filterBarActivePage', () => {
    it('should return NOTIFICATIONS when activePage is NOTIFICATIONS', () => {
      mockPathname.mockReturnValue(PROFILE_ROUTES.NOTIFICATIONS);

      const { result } = renderHook(() => useProfileNavigation());

      expect(result.current.filterBarActivePage).toBe(PROFILE_PAGE_TYPES.NOTIFICATIONS);
    });

    it('should return NOTIFICATIONS when activePage is PROFILE', () => {
      mockPathname.mockReturnValue(PROFILE_ROUTES.PROFILE_PAGE);

      const { result } = renderHook(() => useProfileNavigation());

      expect(result.current.filterBarActivePage).toBe(PROFILE_PAGE_TYPES.NOTIFICATIONS);
    });

    it('should return the same page as activePage for other pages', () => {
      const pages = [
        { route: PROFILE_ROUTES.POSTS, type: PROFILE_PAGE_TYPES.POSTS },
        { route: PROFILE_ROUTES.REPLIES, type: PROFILE_PAGE_TYPES.REPLIES },
        { route: PROFILE_ROUTES.FOLLOWERS, type: PROFILE_PAGE_TYPES.FOLLOWERS },
        { route: PROFILE_ROUTES.FOLLOWING, type: PROFILE_PAGE_TYPES.FOLLOWING },
        { route: PROFILE_ROUTES.FRIENDS, type: PROFILE_PAGE_TYPES.FRIENDS },
        { route: PROFILE_ROUTES.UNIQUE_TAGS, type: PROFILE_PAGE_TYPES.UNIQUE_TAGS },
      ];

      pages.forEach(({ route, type }) => {
        mockPathname.mockReturnValue(route);

        const { result } = renderHook(() => useProfileNavigation());

        expect(result.current.filterBarActivePage).toBe(type);
      });
    });
  });

  describe('navigateToPage', () => {
    it('should navigate to the correct route when called', () => {
      const { result } = renderHook(() => useProfileNavigation());

      act(() => {
        result.current.navigateToPage(PROFILE_PAGE_TYPES.POSTS);
      });

      expect(mockPush).toHaveBeenCalledWith(PROFILE_ROUTES.POSTS);
    });

    it('should navigate to all profile pages correctly', () => {
      const { result } = renderHook(() => useProfileNavigation());

      const navigationTests = [
        { page: PROFILE_PAGE_TYPES.NOTIFICATIONS, route: PROFILE_ROUTES.PROFILE },
        { page: PROFILE_PAGE_TYPES.POSTS, route: PROFILE_ROUTES.POSTS },
        { page: PROFILE_PAGE_TYPES.REPLIES, route: PROFILE_ROUTES.REPLIES },
        { page: PROFILE_PAGE_TYPES.FOLLOWERS, route: PROFILE_ROUTES.FOLLOWERS },
        { page: PROFILE_PAGE_TYPES.FOLLOWING, route: PROFILE_ROUTES.FOLLOWING },
        { page: PROFILE_PAGE_TYPES.FRIENDS, route: PROFILE_ROUTES.FRIENDS },
        { page: PROFILE_PAGE_TYPES.UNIQUE_TAGS, route: PROFILE_ROUTES.UNIQUE_TAGS },
        { page: PROFILE_PAGE_TYPES.PROFILE, route: PROFILE_ROUTES.PROFILE_PAGE },
      ];

      navigationTests.forEach(({ page, route }) => {
        act(() => {
          result.current.navigateToPage(page);
        });

        expect(mockPush).toHaveBeenCalledWith(route);
        mockPush.mockClear();
      });
    });

    it('should work correctly across multiple renders', () => {
      const { result, rerender } = renderHook(() => useProfileNavigation());

      // Call navigateToPage on first render
      act(() => {
        result.current.navigateToPage(PROFILE_PAGE_TYPES.POSTS);
      });

      expect(mockPush).toHaveBeenCalledWith(PROFILE_ROUTES.POSTS);
      mockPush.mockClear();

      // Rerender
      rerender();

      // navigateToPage should still work after rerender
      act(() => {
        result.current.navigateToPage(PROFILE_PAGE_TYPES.REPLIES);
      });

      expect(mockPush).toHaveBeenCalledWith(PROFILE_ROUTES.REPLIES);
    });
  });

  describe('Integration scenarios', () => {
    it('should handle complete navigation flow', () => {
      mockPathname.mockReturnValue(PROFILE_ROUTES.PROFILE);

      const { result, rerender } = renderHook(() => useProfileNavigation());

      // Initial state
      expect(result.current.activePage).toBe(PROFILE_PAGE_TYPES.NOTIFICATIONS);
      expect(result.current.filterBarActivePage).toBe(PROFILE_PAGE_TYPES.NOTIFICATIONS);

      // Navigate to posts
      act(() => {
        result.current.navigateToPage(PROFILE_PAGE_TYPES.POSTS);
      });

      expect(mockPush).toHaveBeenCalledWith(PROFILE_ROUTES.POSTS);

      // Simulate pathname change after navigation
      mockPathname.mockReturnValue(PROFILE_ROUTES.POSTS);
      rerender();

      expect(result.current.activePage).toBe(PROFILE_PAGE_TYPES.POSTS);
      expect(result.current.filterBarActivePage).toBe(PROFILE_PAGE_TYPES.POSTS);
    });

    it('should handle navigation to profile page and filterBarActivePage mapping', () => {
      mockPathname.mockReturnValue(PROFILE_ROUTES.NOTIFICATIONS);

      const { result, rerender } = renderHook(() => useProfileNavigation());

      // Navigate to profile page
      act(() => {
        result.current.navigateToPage(PROFILE_PAGE_TYPES.PROFILE);
      });

      expect(mockPush).toHaveBeenCalledWith(PROFILE_ROUTES.PROFILE_PAGE);

      // Simulate pathname change
      mockPathname.mockReturnValue(PROFILE_ROUTES.PROFILE_PAGE);
      rerender();

      expect(result.current.activePage).toBe(PROFILE_PAGE_TYPES.PROFILE);
      // filterBarActivePage should map PROFILE to NOTIFICATIONS
      expect(result.current.filterBarActivePage).toBe(PROFILE_PAGE_TYPES.NOTIFICATIONS);
    });

    it('should maintain consistent state across multiple re-renders', () => {
      mockPathname.mockReturnValue(PROFILE_ROUTES.POSTS);

      const { result, rerender } = renderHook(() => useProfileNavigation());

      const firstState = {
        activePage: result.current.activePage,
        filterBarActivePage: result.current.filterBarActivePage,
      };

      // Re-render multiple times without changing pathname
      rerender();
      rerender();
      rerender();

      expect(result.current.activePage).toBe(firstState.activePage);
      expect(result.current.filterBarActivePage).toBe(firstState.filterBarActivePage);
    });
  });

  describe('Performance', () => {
    it('should memoize activePage calculation', () => {
      mockPathname.mockReturnValue(PROFILE_ROUTES.POSTS);

      const { result, rerender } = renderHook(() => useProfileNavigation());

      const firstActivePage = result.current.activePage;

      // Re-render without changing pathname
      rerender();

      // Should return the same reference
      expect(result.current.activePage).toBe(firstActivePage);
    });

    it('should memoize filterBarActivePage calculation', () => {
      mockPathname.mockReturnValue(PROFILE_ROUTES.POSTS);

      const { result, rerender } = renderHook(() => useProfileNavigation());

      const firstFilterBarActivePage = result.current.filterBarActivePage;

      // Re-render without changing pathname
      rerender();

      // Should return the same reference
      expect(result.current.filterBarActivePage).toBe(firstFilterBarActivePage);
    });
  });

  describe('Mobile/Desktop viewport behavior for other users', () => {
    beforeEach(() => {
      mockIsOwnProfile.mockReturnValue(false);
    });

    it('should return PROFILE for other user base route on mobile', () => {
      mockIsMobile.mockReturnValue(true);
      mockPathname.mockReturnValue('/profile/user123');

      const { result } = renderHook(() => useProfileNavigation());

      expect(result.current.activePage).toBe(PROFILE_PAGE_TYPES.PROFILE);
    });

    it('should return POSTS for other user base route on desktop', () => {
      mockIsMobile.mockReturnValue(false);
      mockPathname.mockReturnValue('/profile/user123');

      const { result } = renderHook(() => useProfileNavigation());

      expect(result.current.activePage).toBe(PROFILE_PAGE_TYPES.POSTS);
    });

    it('should map filterBarActivePage to POSTS when activePage is PROFILE on mobile', () => {
      mockIsMobile.mockReturnValue(true);
      mockPathname.mockReturnValue('/profile/user123');

      const { result } = renderHook(() => useProfileNavigation());

      expect(result.current.activePage).toBe(PROFILE_PAGE_TYPES.PROFILE);
      expect(result.current.filterBarActivePage).toBe(PROFILE_PAGE_TYPES.POSTS);
    });

    it('should return POSTS for explicit /posts route regardless of viewport', () => {
      mockPathname.mockReturnValue('/profile/user123/posts');

      mockIsMobile.mockReturnValue(true);
      const { result: mobileResult } = renderHook(() => useProfileNavigation());
      expect(mobileResult.current.activePage).toBe(PROFILE_PAGE_TYPES.POSTS);

      mockIsMobile.mockReturnValue(false);
      const { result: desktopResult } = renderHook(() => useProfileNavigation());
      expect(desktopResult.current.activePage).toBe(PROFILE_PAGE_TYPES.POSTS);
    });

    it('should return PROFILE for explicit /profile route regardless of viewport', () => {
      mockPathname.mockReturnValue('/profile/user123/profile');

      mockIsMobile.mockReturnValue(true);
      const { result: mobileResult } = renderHook(() => useProfileNavigation());
      expect(mobileResult.current.activePage).toBe(PROFILE_PAGE_TYPES.PROFILE);

      mockIsMobile.mockReturnValue(false);
      const { result: desktopResult } = renderHook(() => useProfileNavigation());
      expect(desktopResult.current.activePage).toBe(PROFILE_PAGE_TYPES.PROFILE);
    });

    it('should navigate to /profile subpath for other users', () => {
      mockPathname.mockReturnValue('/profile/user123');

      const { result } = renderHook(() => useProfileNavigation());

      act(() => {
        result.current.navigateToPage(PROFILE_PAGE_TYPES.PROFILE);
      });

      expect(mockPush).toHaveBeenCalledWith('/profile/user123/profile');
    });

    it('should navigate to /posts subpath for other users', () => {
      mockPathname.mockReturnValue('/profile/user123');

      const { result } = renderHook(() => useProfileNavigation());

      act(() => {
        result.current.navigateToPage(PROFILE_PAGE_TYPES.POSTS);
      });

      expect(mockPush).toHaveBeenCalledWith('/profile/user123/posts');
    });
  });

  describe('Own profile is unaffected by viewport', () => {
    beforeEach(() => {
      mockIsOwnProfile.mockReturnValue(true);
    });

    it('should return NOTIFICATIONS for own profile base route on mobile', () => {
      mockIsMobile.mockReturnValue(true);
      mockPathname.mockReturnValue(PROFILE_ROUTES.PROFILE);

      const { result } = renderHook(() => useProfileNavigation());

      expect(result.current.activePage).toBe(PROFILE_PAGE_TYPES.NOTIFICATIONS);
    });

    it('should return NOTIFICATIONS for own profile base route on desktop', () => {
      mockIsMobile.mockReturnValue(false);
      mockPathname.mockReturnValue(PROFILE_ROUTES.PROFILE);

      const { result } = renderHook(() => useProfileNavigation());

      expect(result.current.activePage).toBe(PROFILE_PAGE_TYPES.NOTIFICATIONS);
    });

    it('should return NOTIFICATIONS for own profile dynamic base route on mobile', () => {
      mockIsMobile.mockReturnValue(true);
      mockPathname.mockReturnValue('/profile/user123');

      const { result } = renderHook(() => useProfileNavigation());

      expect(result.current.activePage).toBe(PROFILE_PAGE_TYPES.NOTIFICATIONS);
    });

    it('should return NOTIFICATIONS for own profile dynamic base route on desktop', () => {
      mockIsMobile.mockReturnValue(false);
      mockPathname.mockReturnValue('/profile/user123');

      const { result } = renderHook(() => useProfileNavigation());

      expect(result.current.activePage).toBe(PROFILE_PAGE_TYPES.NOTIFICATIONS);
    });

    it('should return NOTIFICATIONS for own profile dynamic notifications route', () => {
      mockIsMobile.mockReturnValue(true);
      mockPathname.mockReturnValue('/profile/user123/notifications');

      const { result } = renderHook(() => useProfileNavigation());

      expect(result.current.activePage).toBe(PROFILE_PAGE_TYPES.NOTIFICATIONS);
    });
  });
});
