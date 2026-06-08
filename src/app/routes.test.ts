import { describe, expect, it } from 'vitest';
import {
  AUTH_ROUTES,
  getProfileRoute,
  isCoreExploreRoute,
  isDynamicPublicRoute,
  isLogoLandingRoute,
  isPostRoute,
  isPublicExploreRoute,
  LOGO_LANDING_ROUTES,
  ONBOARDING_ROUTES,
  PROFILE_ROUTES,
} from './routes';

describe('isDynamicPublicRoute', () => {
  describe('invite routes', () => {
    it('returns true for invite code route', () => {
      expect(isDynamicPublicRoute('/invite/abcdefghijkl')).toBe(true);
    });

    it('returns false for base invite route', () => {
      expect(isDynamicPublicRoute('/invite')).toBe(false);
    });

    it('returns false for invite route with extra segments', () => {
      expect(isDynamicPublicRoute('/invite/abcdefghijkl/extra')).toBe(false);
    });
  });

  describe('post routes', () => {
    it('returns true for valid single post route', () => {
      expect(isDynamicPublicRoute('/post/abc123/xyz789')).toBe(true);
    });

    it('returns true for post route with long pubky', () => {
      const longPubky = 'gujx6qd8ksydh1makdphd3bxu351d9b8waqka8hfg6q7hnqkxexo';
      expect(isDynamicPublicRoute(`/post/${longPubky}/0034BBBDFK83G`)).toBe(true);
    });

    it('returns false for incomplete post route (missing postId)', () => {
      expect(isDynamicPublicRoute('/post/abc123')).toBe(false);
    });

    it('returns false for base post route', () => {
      expect(isDynamicPublicRoute('/post')).toBe(false);
    });

    it('returns false for post route with extra segments', () => {
      expect(isDynamicPublicRoute('/post/abc123/xyz789/extra')).toBe(false);
    });
  });

  describe('profile routes', () => {
    it('returns true for profile with long pubky', () => {
      const longPubky = 'gujx6qd8ksydh1makdphd3bxu351d9b8waqka8hfg6q7hnqkxexo';
      expect(isDynamicPublicRoute(`/profile/${longPubky}`)).toBe(true);
    });

    it('returns false for profile with pubky and legacy posts sub-route (redirected at edge)', () => {
      const longPubky = 'gujx6qd8ksydh1makdphd3bxu351d9b8waqka8hfg6q7hnqkxexo';
      expect(isDynamicPublicRoute(`/profile/${longPubky}/posts`)).toBe(false);
    });

    it('returns false for profile with pubky and other sub-routes', () => {
      const longPubky = 'gujx6qd8ksydh1makdphd3bxu351d9b8waqka8hfg6q7hnqkxexo';
      expect(isDynamicPublicRoute(`/profile/${longPubky}/followers`)).toBe(false);
      expect(isDynamicPublicRoute(`/profile/${longPubky}/following`)).toBe(false);
      expect(isDynamicPublicRoute(`/profile/${longPubky}/friends`)).toBe(false);
      expect(isDynamicPublicRoute(`/profile/${longPubky}/replies`)).toBe(false);
      expect(isDynamicPublicRoute(`/profile/${longPubky}/tagged`)).toBe(false);
    });

    it('returns false for own profile sub-routes', () => {
      expect(isDynamicPublicRoute('/profile/posts')).toBe(false);
      expect(isDynamicPublicRoute('/profile/replies')).toBe(false);
      expect(isDynamicPublicRoute('/profile/followers')).toBe(false);
      expect(isDynamicPublicRoute('/profile/following')).toBe(false);
      expect(isDynamicPublicRoute('/profile/friends')).toBe(false);
      expect(isDynamicPublicRoute('/profile/tagged')).toBe(false);
      expect(isDynamicPublicRoute('/profile/notifications')).toBe(false);
      expect(isDynamicPublicRoute('/profile/profile')).toBe(false);
    });

    it('returns false for base profile route', () => {
      expect(isDynamicPublicRoute('/profile')).toBe(false);
    });

    it('returns false for segments that are not valid pubky format', () => {
      // Pubky must be exactly 52 lowercase alphanumeric characters
      expect(isDynamicPublicRoute('/profile/shortname')).toBe(false);
      expect(isDynamicPublicRoute('/profile/12345678901234567890')).toBe(false); // 20 chars
      expect(isDynamicPublicRoute('/profile/123456789012345678901234567890123456789012345678901')).toBe(false); // 51 chars
      expect(isDynamicPublicRoute('/profile/12345678901234567890123456789012345678901234567890123')).toBe(false); // 53 chars
    });

    it('returns false for 52-char segment with invalid characters', () => {
      // Uppercase characters are invalid
      expect(isDynamicPublicRoute('/profile/GUJX6QD8KSYDH1MAKDPHD3BXU351D9B8WAQKA8HFG6Q7HNQKXEXO')).toBe(false);
      // Special characters are invalid
      expect(isDynamicPublicRoute('/profile/gujx6qd8ksydh1makdphd3bxu351d9b8waqka8hfg6q7hnqkxex!')).toBe(false);
    });

    it('returns true for valid 52-char lowercase alphanumeric pubky', () => {
      // Valid pubky format: exactly 52 lowercase alphanumeric characters
      const validPubky = 'o1gg96ewuojmopcjbz8895478wdtxtzzber7aezq6ror5a91j7dy';
      expect(isDynamicPublicRoute(`/profile/${validPubky}`)).toBe(true);
    });
  });

  describe('other routes', () => {
    it('returns false for home route', () => {
      expect(isDynamicPublicRoute('/home')).toBe(false);
    });

    it('returns false for root route', () => {
      expect(isDynamicPublicRoute('/')).toBe(false);
    });

    it('returns false for settings route', () => {
      expect(isDynamicPublicRoute('/settings')).toBe(false);
    });

    it('returns false for search route', () => {
      expect(isDynamicPublicRoute('/search')).toBe(false);
    });

    it('returns false for feed route', () => {
      expect(isDynamicPublicRoute('/feed')).toBe(false);
    });

    it('returns false for onboarding routes', () => {
      expect(isDynamicPublicRoute('/onboarding')).toBe(false);
      expect(isDynamicPublicRoute('/onboarding/profile')).toBe(false);
    });
  });
});

describe('getProfileRoute', () => {
  const pubky = 'o1gg96ewuojmopcjbz8895478wdtxtzzber7aezq6ror5a91j7dy';

  it('returns unchanged own-profile routes when pubky is omitted', () => {
    expect(getProfileRoute(PROFILE_ROUTES.POSTS)).toBe(PROFILE_ROUTES.POSTS);
  });

  it('uses base profile URL for another user posts tab', () => {
    expect(getProfileRoute(PROFILE_ROUTES.POSTS, pubky)).toBe(`/profile/${pubky}`);
  });

  it('uses base profile URL for another user default profile route', () => {
    expect(getProfileRoute(PROFILE_ROUTES.PROFILE, pubky)).toBe(`/profile/${pubky}`);
  });

  it('uses base profile URL for notifications route with pubky (other user)', () => {
    expect(getProfileRoute(PROFILE_ROUTES.NOTIFICATIONS, pubky)).toBe(`/profile/${pubky}`);
  });

  it('preserves sub-paths other than posts', () => {
    expect(getProfileRoute(PROFILE_ROUTES.FOLLOWERS, pubky)).toBe(`/profile/${pubky}/followers`);
  });
});

describe('isPostRoute', () => {
  it('returns true for single post pages', () => {
    const pubky = 'o1gg96ewuojmopcjbz8895478wdtxtzzber7aezq6ror5a91j7dy';
    expect(isPostRoute(`/post/${pubky}/0034BBBDFK83G`)).toBe(true);
  });

  it('returns false for non-post paths', () => {
    expect(isPostRoute('/post')).toBe(false);
    expect(isPostRoute('/post/user-only')).toBe(false);
    expect(isPostRoute('/home')).toBe(false);
  });
});

describe('isCoreExploreRoute', () => {
  it('returns true for core logged-out explore routes', () => {
    expect(isCoreExploreRoute('/home')).toBe(true);
    expect(isCoreExploreRoute('/hot')).toBe(true);
    expect(isCoreExploreRoute('/search')).toBe(true);
  });

  it('returns false for dynamic public and protected routes', () => {
    const pubky = 'o1gg96ewuojmopcjbz8895478wdtxtzzber7aezq6ror5a91j7dy';

    expect(isCoreExploreRoute(`/post/${pubky}/0034BBBDFK83G`)).toBe(false);
    expect(isCoreExploreRoute(`/profile/${pubky}`)).toBe(false);
    expect(isCoreExploreRoute('/bookmarks')).toBe(false);
    expect(isCoreExploreRoute('/feed/custom-feed')).toBe(false);
    expect(isCoreExploreRoute('/settings/account')).toBe(false);
  });
});

describe('isPublicExploreRoute', () => {
  it('returns true for core explore routes and dynamic post/profile pages', () => {
    const pubky = 'o1gg96ewuojmopcjbz8895478wdtxtzzber7aezq6ror5a91j7dy';

    expect(isPublicExploreRoute('/home')).toBe(true);
    expect(isPublicExploreRoute('/hot')).toBe(true);
    expect(isPublicExploreRoute('/search')).toBe(true);
    expect(isPublicExploreRoute(`/post/${pubky}/0034BBBDFK83G`)).toBe(true);
    expect(isPublicExploreRoute(`/profile/${pubky}`)).toBe(true);
  });

  it('returns false for protected routes', () => {
    expect(isPublicExploreRoute('/bookmarks')).toBe(false);
    expect(isPublicExploreRoute('/feed/custom-feed')).toBe(false);
    expect(isPublicExploreRoute('/settings/account')).toBe(false);
    expect(isPublicExploreRoute('/profile/posts')).toBe(false);
    expect(isPublicExploreRoute('/share')).toBe(false);
    expect(isPublicExploreRoute('/who-to-follow')).toBe(false);
  });
});

describe('isLogoLandingRoute', () => {
  it('returns true for all logo landing routes', () => {
    for (const route of LOGO_LANDING_ROUTES) {
      expect(isLogoLandingRoute(route)).toBe(true);
    }
  });

  it('returns true for every onboarding route', () => {
    for (const route of Object.values(ONBOARDING_ROUTES)) {
      expect(isLogoLandingRoute(route)).toBe(true);
    }
  });

  it('returns true for every auth route', () => {
    for (const route of Object.values(AUTH_ROUTES)) {
      expect(isLogoLandingRoute(route)).toBe(true);
    }
  });

  it('returns false for app and explore routes', () => {
    expect(isLogoLandingRoute('/home')).toBe(false);
    expect(isLogoLandingRoute('/hot')).toBe(false);
    expect(isLogoLandingRoute('/bookmarks')).toBe(false);
    expect(isLogoLandingRoute(null)).toBe(false);
  });
});
