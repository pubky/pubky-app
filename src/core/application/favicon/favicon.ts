import { getFaviconSource } from '@/libs/favicon/favicon';
import { NextJsFaviconService, type TFavicon } from '@/services/nextjs/favicon/favicon';

/** Icons kept in memory at most: at most `FAVICON_MAX_BYTES` each. */
const CACHE_ENTRIES = 256;
/** How long a read icon is served without asking the site again. */
const HIT_TTL_MS = 24 * 60 * 60 * 1000;
/** How long a host without an icon is not asked again. */
const MISS_TTL_MS = 60 * 60 * 1000;

type TCacheEntry = { icon: TFavicon | null; expires: number };

/**
 * Favicon application service: one host's icon for the `/api/favicon` route, read from the site
 * (`NextJsFaviconService`) at the address `getFaviconSource` names for it.
 *
 * Reads are kept in a small in-memory cache, bounded by entry count (oldest used first out), so a
 * page full of cards from the same sites asks each site once a day; a host with no icon is asked
 * again after an hour. Concurrent requests for one host share one read.
 */
export class FaviconApplication {
  private constructor() {}

  private static readonly cache = new Map<string, TCacheEntry>();
  private static readonly inFlight = new Map<string, Promise<TFavicon | null>>();

  /**
   * The icon of a validated host (`FaviconValidators.validateHost`), or `null` when it has none
   * the route may serve.
   */
  static async fetch(host: string): Promise<TFavicon | null> {
    const cached = FaviconApplication.cache.get(host);
    if (cached) {
      FaviconApplication.cache.delete(host);
      if (cached.expires > Date.now()) {
        // Most recently used goes last, so the oldest used is evicted first.
        FaviconApplication.cache.set(host, cached);
        return cached.icon;
      }
    }

    const existing = FaviconApplication.inFlight.get(host);
    if (existing) return existing;

    const promise = NextJsFaviconService.fetch(new URL(getFaviconSource(host)))
      .then((icon) => {
        FaviconApplication.remember(host, icon);
        return icon;
      })
      .finally(() => FaviconApplication.inFlight.delete(host));
    FaviconApplication.inFlight.set(host, promise);
    return promise;
  }

  /** Empties the cache (tests). */
  static clearCache(): void {
    FaviconApplication.cache.clear();
    FaviconApplication.inFlight.clear();
  }

  private static remember(host: string, icon: TFavicon | null): void {
    FaviconApplication.cache.set(host, { icon, expires: Date.now() + (icon ? HIT_TTL_MS : MISS_TTL_MS) });
    while (FaviconApplication.cache.size > CACHE_ENTRIES) {
      const oldest = FaviconApplication.cache.keys().next().value;
      if (oldest === undefined) break;
      FaviconApplication.cache.delete(oldest);
    }
  }
}
