import type { Dispatcher } from 'undici';
import { Logger } from '@/libs/logger/logger';
import { isFaviconContentType, readBodyBytes, sniffImageType } from './favicon/favicon.utils';
import { checkDnsSafety, isHttpProtocol } from './nextjs.utils';
import { SAFE_OG_METADATA_DISPATCHER } from './og-metadata/og-metadata';

/** An image as the app's origin serves it: its bytes and the image type they are. */
export type TGuardedImage = { body: ArrayBuffer; contentType: string };

/**
 * A read that may pass on another try: the host did not answer in time, the connection failed, or it
 * answered a server error or 429. Never remembered as "no image".
 */
export const GUARDED_IMAGE_FAILED = 'failed';

/** A read not made now: a hop's slot (`enterHop`) did not come free in time. Never remembered. */
export const GUARDED_IMAGE_BUSY = 'busy';

/** How one image is read: its caps, what is sent, which hops are followed and which types are served. */
export interface TGuardedImageRead {
  /** The most bytes read; a larger image, declared or streamed, is not served. */
  maxBytes: number;
  /** The whole read, every redirect and the body included. */
  timeoutMs: number;
  maxRedirects: number;
  /** The only headers sent: never a cookie, credentials or anything of the viewer's request. */
  headers: Readonly<Record<string, string>>;
  /** Whether an address may be asked, the first one included, on top of the scheme, credentials and address checks. */
  allowsHop: (url: URL) => boolean;
  /** The types served, as `sniffImageType` names them. */
  types: readonly string[];
  /** Names the read in a debug log line. */
  operation: string;
  /**
   * Waits for a slot to ask `url` (a hop's site), given back when the read ends, or `null` when none
   * came in time: the read is then `GUARDED_IMAGE_BUSY`. Every hop takes one, redirects included. The
   * wait must end when `signal` aborts (the read's timeout), giving no slot.
   */
  enterHop?: (url: URL, signal: AbortSignal) => Promise<(() => void) | null>;
}

type FetchInitWithDispatcher = RequestInit & { dispatcher: Dispatcher };

/**
 * One image read from a remote site for a route that serves it from the app's origin (site icons,
 * Pinakes card images); `null` when there is none to serve (refused by a guard, an address that does
 * not resolve, a client error, not an image of an allowed type, too large), `GUARDED_IMAGE_FAILED`
 * when the read may pass later (no answer in time, a failed connection, a server error or 429),
 * `GUARDED_IMAGE_BUSY` when a hop's slot (`enterHop`) did not come free. Never throws.
 *
 * Every hop goes through the link preview's guards: only `http(s)` without credentials (an `https`
 * read never redirected to `http`), the host's
 * addresses checked before the request (`checkDnsSafety`) and the socket pinned to checked addresses
 * (the link preview's guarded dispatcher), so a private, loopback or link-local address is never
 * reached, also not through a redirect; `allowsHop` narrows that further. At most `maxRedirects`
 * redirects, `timeoutMs` for everything, `maxBytes` read at most, and only bytes that are a raster
 * image of one of `types` (an SVG or an HTML page is never one). Nothing of the viewer's request is
 * sent: only `headers`, no cookies, no referrer.
 */
export async function fetchGuardedImage(
  source: URL,
  read: TGuardedImageRead,
): Promise<TGuardedImage | null | typeof GUARDED_IMAGE_FAILED | typeof GUARDED_IMAGE_BUSY> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), read.timeoutMs);
  // The address check does not take a signal: the read's timeout ends the wait for it too.
  const aborted = new Promise<never>((_resolve, reject) => {
    controller.signal.addEventListener('abort', () => reject(controller.signal.reason), { once: true });
  });
  aborted.catch(() => {});
  const releases: (() => void)[] = [];
  try {
    let url = source;
    // Once read over https, every later hop is too.
    let secure = false;
    for (let hop = 0; hop <= read.maxRedirects; hop++) {
      if (!isHttpProtocol(url) || url.username || url.password || !read.allowsHop(url)) return null;
      // Never from https down to http: a cover read in the clear could be swapped on the way.
      if (secure && url.protocol === 'http:') return null;
      secure ||= url.protocol === 'https:';
      if (read.enterHop) {
        // The read's signal ends the wait too: a hop given up on never takes a slot later.
        const release = await Promise.race([read.enterHop(url, controller.signal), aborted]);
        if (!release) return GUARDED_IMAGE_BUSY;
        releases.push(release);
      }
      const dns = await Promise.race([checkDnsSafety(url.hostname), aborted]);
      if (!dns.ok) return null;

      const response = await fetch(url, {
        headers: read.headers,
        redirect: 'manual',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        signal: controller.signal,
        dispatcher: SAFE_OG_METADATA_DISPATCHER,
      } as FetchInitWithDispatcher);

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        response.body?.cancel().catch(() => {});
        if (!location || !URL.canParse(location, url)) return null;
        url = new URL(location, url);
        continue;
      }

      if (response.status >= 500 || response.status === 429) {
        response.body?.cancel().catch(() => {});
        return GUARDED_IMAGE_FAILED;
      }
      if (!response.ok || !isFaviconContentType(response.headers.get('content-type'))) {
        response.body?.cancel().catch(() => {});
        return null;
      }
      const declaredLength = Number(response.headers.get('content-length'));
      if (declaredLength > read.maxBytes) {
        response.body?.cancel().catch(() => {});
        return null;
      }

      const bytes = await readBodyBytes(response, read.maxBytes);
      // Cut off by the timeout, the body may come whole another time; past the cap it never does.
      if (!bytes) return controller.signal.aborted ? GUARDED_IMAGE_FAILED : null;
      const contentType = sniffImageType(bytes);
      return contentType && read.types.includes(contentType)
        ? { body: bytes.buffer as ArrayBuffer, contentType }
        : null;
    }
    return null;
  } catch (error) {
    // A timeout or a failed connection: it may pass another time. A bad redirect address: no image.
    Logger.debug(`[${read.operation}]`, {
      hostname: source.hostname,
      errorName: error instanceof Error ? error.name : undefined,
    });
    return controller.signal.aborted || error instanceof TypeError ? GUARDED_IMAGE_FAILED : null;
  } finally {
    clearTimeout(timeoutId);
    for (const release of releases) release();
  }
}
