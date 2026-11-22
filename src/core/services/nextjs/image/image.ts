import {
  fetchGuardedImage,
  type GUARDED_IMAGE_BUSY,
  type GUARDED_IMAGE_FAILED,
  type TGuardedImage,
  type TGuardedImageRead,
} from '../nextjs.image';

/**
 * The largest card image served. Covers measured on 2026-11-22: Spotify 46-73 KB, Apple 22-68 KB,
 * YouTube `maxresdefault` 65 KB, Wikimedia 960px thumbs ~106 KB, Cover Art Archive 29 KB (500px),
 * 104 KB (1200px) and 383 KB (full size), Bandcamp `_10` 271 KB, a podcast's 3000px cover 415 KB.
 * 4 MB serves every one of those with room for a large podcast PNG, and keeps a read's memory
 * bounded: `IMAGE_CACHE_BYTES` for the images kept, `IMAGE_MAX_IN_FLIGHT` for the reads running.
 */
export const IMAGE_MAX_BYTES = 4 * 1024 * 1024;
/** The whole read, every redirect and the body included: the Cover Art Archive's two hops take ~2 s. */
export const IMAGE_TIMEOUT_MS = 8_000;
/** The Cover Art Archive redirects twice (`coverartarchive.org` → `archive.org` → a mirror). */
const MAX_REDIRECTS = 3;
/** Raster images a browser shows in an `<img>`; never SVG (it can carry script), ICO or a page. */
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

/** A short browser identity, as for site icons; no cookies, credentials or viewer headers are ever sent. */
const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0',
  Accept: 'image/webp,image/png,image/jpeg,image/gif;q=0.9,image/*;q=0.8',
};

/**
 * Next.js image service: reads one Pinakes card image for the `/api/image` route.
 *
 * Every hop goes through the link preview's guards (`fetchGuardedImage`: address checks before each
 * request and a socket pinned to checked addresses, so a private, loopback or link-local address is
 * never reached, also not through a redirect). Image CDNs redirect across sites (the Cover Art
 * Archive to `archive.org`), so a redirect may lead to another site, over `http(s)` on the scheme's
 * own port, at most `MAX_REDIRECTS` times, each hop checked as the first. `IMAGE_TIMEOUT_MS` for
 * everything, `IMAGE_MAX_BYTES` read at most, and only bytes that are a JPEG, PNG, WebP or GIF.
 */
export class NextJsImageService {
  private constructor() {}

  /**
   * The image at `source` (an address a card or a link preview carries); `null` when there is none to
   * serve (refused by a guard, not a raster image, too large, a client error), `GUARDED_IMAGE_FAILED`
   * when the host failed for now (no answer in time, a failed connection, a server error or 429),
   * `GUARDED_IMAGE_BUSY` when a hop's slot (`enterHop`, the caller's per-site limit) did not come free.
   * Never throws.
   */
  static async fetch(
    source: URL,
    { enterHop }: Pick<TGuardedImageRead, 'enterHop'> = {},
  ): Promise<TGuardedImage | null | typeof GUARDED_IMAGE_FAILED | typeof GUARDED_IMAGE_BUSY> {
    return fetchGuardedImage(source, {
      enterHop,
      maxBytes: IMAGE_MAX_BYTES,
      timeoutMs: IMAGE_TIMEOUT_MS,
      maxRedirects: MAX_REDIRECTS,
      headers: FETCH_HEADERS,
      allowsHop: (url) => url.port === '',
      types: IMAGE_TYPES,
      operation: 'image:fetch',
    });
  }
}
