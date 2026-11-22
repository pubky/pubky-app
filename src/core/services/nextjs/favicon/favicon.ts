import type { Dispatcher } from 'undici';
import type { TFavicon } from '@/application/favicon/favicon.types';
import { getFaviconSite } from '@/libs/favicon/favicon';
import { Logger } from '@/libs/logger/logger';
import { checkDnsSafety, isHttpProtocol } from '../nextjs.utils';
import { SAFE_OG_METADATA_DISPATCHER } from '../og-metadata/og-metadata';
import { isFaviconContentType, readBodyBytes, sniffImageType } from './favicon.utils';

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

type FetchInitWithDispatcher = RequestInit & { dispatcher: Dispatcher };

/**
 * Next.js favicon service: reads one site icon for the `/api/favicon` route.
 *
 * Every hop goes through the link preview's guards: the host's addresses are checked before the
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
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FAVICON_TIMEOUT_MS);
    // The address check does not take a signal: the read's timeout ends the wait for it too.
    const aborted = new Promise<never>((_resolve, reject) => {
      controller.signal.addEventListener('abort', () => reject(controller.signal.reason), { once: true });
    });
    aborted.catch(() => {});
    try {
      const site = getFaviconSite(source.hostname);
      let url = source;
      for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
        if (!isHttpProtocol(url) || url.username || url.password) return null;
        if (url.protocol !== 'https:' || url.port !== '' || getFaviconSite(url.hostname) !== site) return null;
        const dns = await Promise.race([checkDnsSafety(url.hostname), aborted]);
        if (!dns.ok) return null;

        const response = await fetch(url, {
          headers: FETCH_HEADERS,
          redirect: 'manual',
          credentials: 'omit',
          referrerPolicy: 'no-referrer',
          signal: controller.signal,
          dispatcher: SAFE_OG_METADATA_DISPATCHER,
        } as FetchInitWithDispatcher);

        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get('location');
          response.body?.cancel().catch(() => {});
          if (!location) return null;
          url = new URL(location, url);
          continue;
        }

        if (!response.ok || !isFaviconContentType(response.headers.get('content-type'))) {
          response.body?.cancel().catch(() => {});
          return null;
        }
        const declaredLength = Number(response.headers.get('content-length'));
        if (declaredLength > FAVICON_MAX_BYTES) {
          response.body?.cancel().catch(() => {});
          return null;
        }

        const bytes = await readBodyBytes(response, FAVICON_MAX_BYTES);
        if (!bytes) return null;
        const contentType = sniffImageType(bytes);
        return contentType ? { body: bytes.buffer as ArrayBuffer, contentType } : null;
      }
      return null;
    } catch (error) {
      // A blocked address, a DNS miss, a timeout or a refused redirect: no icon, as for a 404.
      Logger.debug('[favicon:fetch]', {
        hostname: source.hostname,
        errorName: error instanceof Error ? error.name : undefined,
      });
      return null;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
