import { describe, expect, it } from 'vitest';
import { APP_ROUTES, COLLECTION_ROUTES } from '@/app/routes';
import { TIMELINE_FEED_VARIANT } from '@/config/feed';
import { matchFeedsRouteKey, tryResolveFeedsShellConfig } from './configs';

describe('matchFeedsRouteKey', () => {
  it('returns the correct key for each feeds route', () => {
    expect(matchFeedsRouteKey(APP_ROUTES.HOME)).toBe('home');
    expect(matchFeedsRouteKey(APP_ROUTES.SEARCH)).toBe('search');
    expect(matchFeedsRouteKey('/feed/abc123')).toBe('customFeed');
  });

  it('returns null for non-feeds pathnames', () => {
    expect(matchFeedsRouteKey('/post/alice/123')).toBeNull();
    expect(matchFeedsRouteKey('/hot')).toBeNull();
    // Bare /feed (no id) is not a feeds route either.
    expect(matchFeedsRouteKey(APP_ROUTES.FEED)).toBeNull();
    expect(matchFeedsRouteKey('/totally-unknown')).toBeNull();
  });
});

describe('tryResolveFeedsShellConfig', () => {
  it('returns the same config object identity for repeated calls on the same route', () => {
    const a = tryResolveFeedsShellConfig(APP_ROUTES.HOME);
    const b = tryResolveFeedsShellConfig(APP_ROUTES.HOME);
    expect(a).toBe(b);
  });

  it('returns the home config with HOME feedVariant', () => {
    const config = tryResolveFeedsShellConfig(APP_ROUTES.HOME);
    expect(config).not.toBeNull();
    expect(config?.feedVariant).toBe(TIMELINE_FEED_VARIANT.HOME);
    expect(config?.showRightMobileButton).toBeUndefined();
    expect(config?.rightDrawerContent).toBeDefined();
    expect(config?.hasGradientBackground).toBe(false);
    expect(config?.classNameMobileHeader).toBe('pb-0');
  });

  it('returns the customFeed config for /feed/<id>', () => {
    const config = tryResolveFeedsShellConfig('/feed/abc123');
    expect(config).not.toBeNull();
    expect(config?.feedVariant).toBe(TIMELINE_FEED_VARIANT.CUSTOM);
    expect(config?.rightDrawerContent).toBeDefined();
    expect(config?.hasGradientBackground).toBe(false);
    expect(config?.classNameMobileHeader).toBe('pb-0');
  });

  it('returns the search config with showRightMobileButton=false and no mobile right drawer', () => {
    const config = tryResolveFeedsShellConfig(APP_ROUTES.SEARCH);
    expect(config).not.toBeNull();
    expect(config?.feedVariant).toBe(TIMELINE_FEED_VARIANT.SEARCH);
    expect(config?.showRightMobileButton).toBe(false);
  });

  it('returns null for the intercepted-post pathname', () => {
    // While the (.)post slot is active, usePathname() returns /post/<user>/<post>.
    // The layout decides what to do with the null (cache fallback when modal
    // is active, otherwise throw).
    expect(tryResolveFeedsShellConfig('/post/alice/123')).toBeNull();
  });

  it('returns null for any other non-feeds pathname', () => {
    expect(tryResolveFeedsShellConfig('/hot')).toBeNull();
    expect(tryResolveFeedsShellConfig(APP_ROUTES.COLLECTIONS)).toBeNull();
    expect(tryResolveFeedsShellConfig(COLLECTION_ROUTES.BOOKMARKS)).toBeNull();
    expect(tryResolveFeedsShellConfig('/who-to-follow')).toBeNull();
    expect(tryResolveFeedsShellConfig('/settings/account')).toBeNull();
  });
});
