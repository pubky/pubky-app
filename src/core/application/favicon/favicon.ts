import { FAVICON_BUSY, type TFavicon, type TFaviconRead } from '@/application/favicon/favicon.types';
import { getFaviconOverrideDomain, getFaviconSource } from '@/libs/favicon/favicon';
import { NextJsFaviconService } from '@/services/nextjs/favicon/favicon';
import { BOUNDED_READ_BUSY, BoundedReadCache } from '@/utils/bounded-cache';

/** Hosts kept in memory at most, with or without an icon. */
export const FAVICON_CACHE_ENTRIES = 256;
/** Bytes of icons kept in memory at most, all hosts together (each at most `FAVICON_MAX_BYTES`). */
export const FAVICON_CACHE_BYTES = 16 * 1024 * 1024;
/**
 * Reads of different hosts running at once at most. A read holds up to twice `FAVICON_MAX_BYTES`
 * (the body's parts and the joined copy) for up to its 5 s, so all reads together stay near 32 MB.
 */
export const FAVICON_MAX_IN_FLIGHT = 64;
/** How long a read icon is served without asking the site again. */
const HIT_TTL_MS = 24 * 60 * 60 * 1000;
/** How long a host without an icon is not asked again. */
const MISS_TTL_MS = 60 * 60 * 1000;

/**
 * Favicon application service: one host's icon for the `/api/favicon` route, read from the site
 * (`NextJsFaviconService`) at the address `getFaviconSource` names for it.
 *
 * Reads are kept in a small in-memory cache (`BoundedReadCache`), bounded by entry count and by the
 * icons' total bytes (oldest used first out), so a page full of cards from the same sites asks each
 * site once a day; a host with no icon is asked again after an hour. Concurrent requests for one host
 * share one read, and at most `FAVICON_MAX_IN_FLIGHT` hosts are read at once: past that a new host
 * gets `FAVICON_BUSY` (nothing read, nothing remembered).
 */
export class FaviconApplication {
  private constructor() {}

  private static readonly cache = new BoundedReadCache<TFavicon>({
    maxEntries: FAVICON_CACHE_ENTRIES,
    maxBytes: FAVICON_CACHE_BYTES,
    maxInFlight: FAVICON_MAX_IN_FLIGHT,
    hitTtlMs: HIT_TTL_MS,
    missTtlMs: MISS_TTL_MS,
    sizeOf: (icon) => icon.body.byteLength,
  });

  /**
   * The icon of a validated host (`FaviconValidators.validateHost`), `null` when it has none the
   * route may serve, or `FAVICON_BUSY` when too many other hosts are being read right now.
   */
  static async fetch(requested: string): Promise<TFaviconRead> {
    // Every subdomain of a site whose icon is listed (`<artist>.bandcamp.com`) is one icon, one entry.
    const host = getFaviconOverrideDomain(requested) ?? requested;
    const icon = await FaviconApplication.cache.read(host, () =>
      NextJsFaviconService.fetch(new URL(getFaviconSource(host))),
    );
    return icon === BOUNDED_READ_BUSY ? FAVICON_BUSY : icon;
  }

  /** Empties the cache (tests). */
  static clearCache(): void {
    FaviconApplication.cache.clear();
  }
}
