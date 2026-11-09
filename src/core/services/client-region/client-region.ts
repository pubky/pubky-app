import type { TClientCountryResult } from './client-region.types';

/**
 * The Shop's own region route, reached through the same-origin `/shop-embed` mount (docs/shop-embedding.md).
 * It answers `{ "country": "DE" | null }` from the edge's `X-Client-Region` header, which the edge sets for the
 * Shop backend, the transaction service and the Lock Server alike.
 */
export const CLIENT_REGION_PATH = '/shop-embed/api/marketplace/client-region';

const TIMEOUT_MS = 5000;
const UNAVAILABLE: TClientCountryResult = { status: 'unavailable' };

/**
 * Reads the viewer's country before the Lock Server is asked. The answer only decides whether to show a
 * notice up front, so every way the route can fail (no Shop mounted, a proxy's HTML page, an outage, a
 * timeout, an odd body) is the plain value `unavailable`, never an error: nothing is thrown, logged or
 * sent to Sentry for an environment that simply has no Shop beside it. The Lock Server stays the authority.
 */
export class ClientRegionService {
  private constructor() {}

  static async fetchCountry(): Promise<TClientCountryResult> {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(CLIENT_REGION_PATH, {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        redirect: 'error',
        signal: abort.signal,
      });
      if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) return UNAVAILABLE;
      const body: unknown = await response.json().catch(() => null);
      if (typeof body !== 'object' || body === null || !('country' in body)) return UNAVAILABLE;
      if (body.country === null) return { status: 'ready', country: null };
      if (typeof body.country === 'string' && /^[A-Z]{2}$/.test(body.country)) {
        return { status: 'ready', country: body.country };
      }
      return UNAVAILABLE;
    } catch {
      return UNAVAILABLE;
    } finally {
      clearTimeout(timer);
    }
  }
}
