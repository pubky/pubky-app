import type { TFavicon } from '@/application/favicon/favicon.types';
import { getFaviconOverrideDomain, getFaviconSource } from '@/libs/favicon/favicon';
import { NextJsFaviconService } from '@/services/nextjs/favicon/favicon';

/** Hosts kept in memory at most, with or without an icon. */
export const FAVICON_CACHE_ENTRIES = 256;
/** Bytes of icons kept in memory at most, all hosts together (each at most `FAVICON_MAX_BYTES`). */
export const FAVICON_CACHE_BYTES = 16 * 1024 * 1024;
/** How long a read icon is served without asking the site again. */
const HIT_TTL_MS = 24 * 60 * 60 * 1000;
/** How long a host without an icon is not asked again. */
const MISS_TTL_MS = 60 * 60 * 1000;

type TCacheEntry = { icon: TFavicon | null; expires: number };

/**
 * Favicon application service: one host's icon for the `/api/favicon` route, read from the site
 * (`NextJsFaviconService`) at the address `getFaviconSource` names for it.
 *
 * Reads are kept in a small in-memory cache, bounded by entry count and by the icons' total bytes
 * (oldest used first out), so a page full of cards from the same sites asks each site once a day;
 * a host with no icon is asked again after an hour. Concurrent requests for one host share one read.
 */
export class FaviconApplication {
  private constructor() {}

  private static readonly cache = new Map<string, TCacheEntry>();
  /** Bytes of the icons in `cache`. */
  private static cacheBytes = 0;
  private static readonly inFlight = new Map<string, Promise<TFavicon | null>>();

  /**
   * The icon of a validated host (`FaviconValidators.validateHost`), or `null` when it has none
   * the route may serve.
   */
  static async fetch(requested: string): Promise<TFavicon | null> {
    // Every subdomain of a site whose icon is listed (`<artist>.bandcamp.com`) is one icon, one entry.
    const host = getFaviconOverrideDomain(requested) ?? requested;
    const cached = FaviconApplication.cache.get(host);
    if (cached) {
      FaviconApplication.forget(host);
      if (cached.expires > Date.now()) {
        // Most recently used goes last, so the oldest used is evicted first.
        FaviconApplication.keep(host, cached);
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
    FaviconApplication.cacheBytes = 0;
    FaviconApplication.inFlight.clear();
  }

  private static remember(host: string, icon: TFavicon | null): void {
    FaviconApplication.forget(host);
    FaviconApplication.keep(host, { icon, expires: Date.now() + (icon ? HIT_TTL_MS : MISS_TTL_MS) });
    while (
      FaviconApplication.cache.size > FAVICON_CACHE_ENTRIES ||
      FaviconApplication.cacheBytes > FAVICON_CACHE_BYTES
    ) {
      const oldest = FaviconApplication.cache.keys().next().value;
      if (oldest === undefined) break;
      FaviconApplication.forget(oldest);
    }
  }

  /** Adds an entry as the most recently used one. */
  private static keep(host: string, entry: TCacheEntry): void {
    FaviconApplication.cache.set(host, entry);
    FaviconApplication.cacheBytes += entry.icon?.body.byteLength ?? 0;
  }

  /** Removes an entry, if there is one. */
  private static forget(host: string): void {
    const entry = FaviconApplication.cache.get(host);
    if (!entry) return;
    FaviconApplication.cache.delete(host);
    FaviconApplication.cacheBytes -= entry.icon?.body.byteLength ?? 0;
  }
}
