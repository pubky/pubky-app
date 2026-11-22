import type { TFavicon } from '@/application/favicon/favicon.types';
import { getFaviconSite } from '@/libs/favicon/favicon';
import { fetchGuardedImage, GUARDED_IMAGE_BUSY, GUARDED_IMAGE_FAILED } from '../nextjs.image';

/**
 * The largest icon served. Most favicons are a few KB, but an ICO holding several sizes is larger:
 * Mixcloud's is 112 KB, Eventbrite's 177 KB. Memory stays bounded by the application service:
 * `FAVICON_CACHE_BYTES` for the icons it keeps, `FAVICON_MAX_IN_FLIGHT` for the reads running.
 */
export const FAVICON_MAX_BYTES = 256 * 1024;
/** The whole read, every redirect and the body included. */
const FAVICON_TIMEOUT_MS = 5_000;
const MAX_REDIRECTS = 3;

/**
 * A short browser identity. Some sites refuse a read without a browser User-Agent (HBO Max answers 403),
 * and some answer a full desktop-Chrome string from a server with a bot check instead of the icon
 * (Mixcloud's Cloudflare challenge, Instagram's HTML page). `Mozilla/5.0` gets the icon from both kinds.
 * No cookies, credentials or viewer headers are ever sent.
 */
const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0',
  Accept: 'image/webp,image/png,image/x-icon,image/*;q=0.8',
};

/** Every raster type `sniffImageType` names: ICO, PNG, GIF, JPEG and WebP. */
const FAVICON_TYPES = ['image/x-icon', 'image/png', 'image/gif', 'image/jpeg', 'image/webp'];

/**
 * Next.js favicon service: reads one site icon for the `/api/favicon` route.
 *
 * Every hop goes through the link preview's guards (`fetchGuardedImage`): the host's addresses are checked before the
 * request (`checkDnsSafety`) and the socket is pinned to checked addresses (the link preview's
 * guarded dispatcher), so a private, loopback or link-local address is never reached, also not
 * through a redirect. A redirect is followed only on the same site (`getFaviconSite`: `tidal.com` to
 * `www.tidal.com` or `cdn.tidal.com`), over `https` on its default port, at most `MAX_REDIRECTS`
 * times, so a read never leaves the address the route names for the host. `FAVICON_TIMEOUT_MS` for
 * everything, `FAVICON_MAX_BYTES` read at most, and only bytes that are a raster image.
 */
export class NextJsFaviconService {
  private constructor() {}

  /**
   * The icon at `source` (`getFaviconSource`), or `null` when there is none to serve: refused by
   * a guard, not answered in time, not an image, too large, or any error. Never throws.
   */
  static async fetch(source: URL): Promise<TFavicon | null> {
    const site = getFaviconSite(source.hostname);
    const icon = await fetchGuardedImage(source, {
      maxBytes: FAVICON_MAX_BYTES,
      timeoutMs: FAVICON_TIMEOUT_MS,
      maxRedirects: MAX_REDIRECTS,
      headers: FETCH_HEADERS,
      allowsHop: (url) => url.protocol === 'https:' && url.port === '' && getFaviconSite(url.hostname) === site,
      types: FAVICON_TYPES,
      operation: 'favicon:fetch',
    });
    // A site that may answer later has no icon now, as before: the icon route has no failed answer.
    return icon === GUARDED_IMAGE_FAILED || icon === GUARDED_IMAGE_BUSY ? null : icon;
  }
}
