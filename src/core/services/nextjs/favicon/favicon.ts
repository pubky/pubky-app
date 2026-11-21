import type { Dispatcher } from 'undici';
import { Logger } from '@/libs/logger/logger';
import { checkDnsSafety, isHttpProtocol } from '../nextjs.utils';
import { SAFE_OG_METADATA_DISPATCHER } from '../og-metadata/og-metadata';
import { isFaviconContentType, readBodyBytes, sniffImageType } from './favicon.utils';

/** The largest icon served: real favicons are a few KB, the largest common ones ~40 KB. */
export const FAVICON_MAX_BYTES = 64 * 1024;
/** The whole read, every redirect and the body included. */
const FAVICON_TIMEOUT_MS = 5_000;
const MAX_REDIRECTS = 3;

/**
 * A browser identity, as the link preview uses: some sites answer anything else with a 403 page.
 * No cookies, credentials or viewer headers are ever sent.
 */
const FETCH_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: 'image/avif,image/webp,image/png,image/x-icon,image/*;q=0.8',
};

/** A site's icon as served from the app's origin: its bytes and the type they are (`sniffImageType`). */
export type TFavicon = { body: ArrayBuffer; contentType: string };

type FetchInitWithDispatcher = RequestInit & { dispatcher: Dispatcher };

/**
 * Next.js favicon service: reads one site icon for the `/api/favicon` route.
 *
 * Every hop goes through the link preview's guards: the host's addresses are checked before the
 * request (`checkDnsSafety`) and the socket is pinned to checked addresses (the link preview's
 * guarded dispatcher), so a private, loopback or link-local address is never reached, also not
 * through a redirect. At most `MAX_REDIRECTS` redirects (`http`/`https` only), `FAVICON_TIMEOUT_MS`
 * for everything, `FAVICON_MAX_BYTES` read at most, and only bytes that are a raster image.
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
    try {
      let url = source;
      for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
        if (!isHttpProtocol(url) || url.username || url.password) return null;
        const dns = await checkDnsSafety(url.hostname);
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
