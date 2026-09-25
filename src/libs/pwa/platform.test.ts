import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PWA_STANDALONE_MEDIA_QUERY } from '@/config/pwa';
import { isAppBadgeSupported, isIosDevice, isServiceWorkerEnabled, isStandaloneDisplayMode } from './platform';

function defineNavigator(overrides: Record<string, unknown>) {
  for (const [key, value] of Object.entries(overrides)) {
    Object.defineProperty(window.navigator, key, { configurable: true, value });
  }
  return () => {
    for (const key of Object.keys(overrides)) Reflect.deleteProperty(window.navigator, key);
  };
}

describe('platform', () => {
  afterEach(() => {
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
      const restore = defineNavigator({ standalone: true });
      expect(isStandaloneDisplayMode()).toBe(true);
      restore();
    });
  });

  describe('isIosDevice', () => {
    it('detects iPhone user agents', () => {
      const restore = defineNavigator({
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
        platform: 'iPhone',
        maxTouchPoints: 5,
      });
      expect(isIosDevice()).toBe(true);
      restore();
    });

    it('detects iPadOS reporting itself as a Mac with touch', () => {
      const restore = defineNavigator({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15',
        platform: 'MacIntel',
        maxTouchPoints: 5,
      });
      expect(isIosDevice()).toBe(true);
      restore();
    });

    it('does not flag a desktop Mac', () => {
      const restore = defineNavigator({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15',
        platform: 'MacIntel',
        maxTouchPoints: 0,
      });
      expect(isIosDevice()).toBe(false);
      restore();
    });
  });

  describe('isAppBadgeSupported', () => {
    it('requires both badge methods', () => {
      expect(isAppBadgeSupported()).toBe(false);
      const restore = defineNavigator({ setAppBadge: vi.fn(), clearAppBadge: vi.fn() });
      expect(isAppBadgeSupported()).toBe(true);
      restore();
    });
  });

  describe('isServiceWorkerEnabled', () => {
    let restoreNavigator: () => void;

    beforeEach(() => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubGlobal('caches', {});
      restoreNavigator = defineNavigator({ serviceWorker: {} });
    });

    afterEach(() => {
      restoreNavigator();
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    });

    it('is true in production builds with service worker and Cache API support', () => {
      expect(isServiceWorkerEnabled()).toBe(true);
    });

    it.each(['development', 'test'])('is false when NODE_ENV is %s', (environment) => {
      vi.stubEnv('NODE_ENV', environment);
      expect(isServiceWorkerEnabled()).toBe(false);
    });

    it('is false without service worker support', () => {
      restoreNavigator();
      expect(isServiceWorkerEnabled()).toBe(false);
    });

    it('is false without the Cache API', () => {
      vi.stubGlobal('caches', undefined);
      expect(isServiceWorkerEnabled()).toBe(false);
    });
  });
});
