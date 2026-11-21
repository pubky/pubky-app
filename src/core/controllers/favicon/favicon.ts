import { FaviconApplication } from '@/application/favicon/favicon';
import { FAVICON_BUSY, type TFavicon } from '@/application/favicon/favicon.types';
import { HttpStatusCode } from '@/libs/http/http.types';
import { FaviconValidators } from '@/pipes/favicon/favicon.validators';

export type TFaviconControllerResult =
  | { ok: true; icon: TFavicon }
  | {
      ok: false;
      statusCode: HttpStatusCode.BAD_REQUEST | HttpStatusCode.NOT_FOUND | HttpStatusCode.SERVICE_UNAVAILABLE;
    };

/**
 * Controller for site icons served from the app's origin (`/api/favicon`), so a viewer's browser
 * never asks the sites themselves.
 */
export class FaviconController {
  private constructor() {}

  /**
   * One host's icon.
   *
   * @param params.host - Raw `host` from the request (may be null): a public DNS name, never a URL
   * @returns The icon, 400 for a host the route does not read from, 404 when the site has none,
   *   503 while too many other hosts are being read
   */
  static async fetch(params: { host: string | null }): Promise<TFaviconControllerResult> {
    const host = FaviconValidators.validateHost(params.host);
    if (!host) return { ok: false, statusCode: HttpStatusCode.BAD_REQUEST };
    const icon = await FaviconApplication.fetch(host);
    if (icon === FAVICON_BUSY) return { ok: false, statusCode: HttpStatusCode.SERVICE_UNAVAILABLE };
    return icon ? { ok: true, icon } : { ok: false, statusCode: HttpStatusCode.NOT_FOUND };
  }
}
