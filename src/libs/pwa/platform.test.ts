import { afterEach, describe, expect, it, vi } from 'vitest';
import { PWA_STANDALONE_MEDIA_QUERY } from '@/config/pwa';
import { isAndroidIntentDevice, isAppBadgeSupported, isIosDevice, isStandaloneDisplayMode } from './platform';

const definedNavigatorKeys = new Set<string>();

function defineNavigator(overrides: Record<string, unknown>) {
  for (const [key, value] of Object.entries(overrides)) {
    Object.defineProperty(window.navigator, key, { configurable: true, value });
    definedNavigatorKeys.add(key);
  }
}

describe('platform', () => {
  afterEach(() => {
    for (const key of definedNavigatorKeys) Reflect.deleteProperty(window.navigator, key);
    definedNavigatorKeys.clear();
    Reflect.deleteProperty(window, 'matchMedia');
    vi.restoreAllMocks();
  });

  describe('isStandaloneDisplayMode', () => {
    it('is false in jsdom without matchMedia', () => {
      expect(isStandaloneDisplayMode()).toBe(false);
    });

    it('queries the standalone / minimal-ui media query', () => {
      const matchMedia = vi.fn(() => ({ matches: true }));
      Object.defineProperty(window, 'matchMedia', { configurable: true, value: matchMedia });

      expect(isStandaloneDisplayMode()).toBe(true);
      expect(matchMedia).toHaveBeenCalledWith(PWA_STANDALONE_MEDIA_QUERY);
    });

    it('honours the iOS navigator.standalone flag', () => {
      defineNavigator({ standalone: true });
      expect(isStandaloneDisplayMode()).toBe(true);
    });
  });

  describe('isIosDevice', () => {
    it('detects iPhone user agents', () => {
      defineNavigator({
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
        platform: 'iPhone',
        maxTouchPoints: 5,
      });
      expect(isIosDevice()).toBe(true);
    });

    it('detects iPadOS reporting itself as a Mac with touch', () => {
      defineNavigator({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15',
        platform: 'MacIntel',
        maxTouchPoints: 5,
      });
      expect(isIosDevice()).toBe(true);
    });

    it('does not flag a desktop Mac', () => {
      defineNavigator({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15',
        platform: 'MacIntel',
        maxTouchPoints: 0,
      });
      expect(isIosDevice()).toBe(false);
    });
  });

  describe('isAndroidIntentDevice', () => {
    it('detects Android Chrome user agents', () => {
      defineNavigator({
        userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/140.0 Mobile',
      });
      expect(isAndroidIntentDevice()).toBe(true);
    });

    it('excludes Firefox for Android so callers fall back to the plain link', () => {
      defineNavigator({
        userAgent: 'Mozilla/5.0 (Android 15; Mobile; rv:136.0) Gecko/136.0 Firefox/136.0',
      });
      expect(isAndroidIntentDevice()).toBe(false);
    });

    it('falls back to the plain link for Chrome in Desktop site mode', () => {
      defineNavigator({
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36',
      });
      expect(isAndroidIntentDevice()).toBe(false);
    });

    it('does not flag iOS or desktop user agents', () => {
      defineNavigator({
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15',
      });
      expect(isAndroidIntentDevice()).toBe(false);
    });
  });

  describe('isAppBadgeSupported', () => {
    it('requires both badge methods', () => {
      expect(isAppBadgeSupported()).toBe(false);
      defineNavigator({ setAppBadge: vi.fn(), clearAppBadge: vi.fn() });
      expect(isAppBadgeSupported()).toBe(true);
    });
  });
});
