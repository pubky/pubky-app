import type { TShopListingMetadata, TShopListingMetadataRoute } from '@/application/shop-metadata/shop-metadata.types';
import { getDefaultUrl } from '@/config/metadata';
import { safeFetch } from '@/libs/error/error.http';
import { ErrorService } from '@/libs/error/error.types';
import { extractShopMetadata } from './shop-metadata.utils';

const FETCH_TIMEOUT_MS = 6000;
const MAX_HTML_BYTES = 1024 * 1024;

/** Server-only preview enrichment through the existing public Shop mount, without a user session. */
export class ShopMetadataService {
  private constructor() {}

  static async fetch(route: TShopListingMetadataRoute): Promise<TShopListingMetadata | null> {
    const abort = new AbortController();
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<null>((resolve) => {
      timer = setTimeout(() => {
        abort.abort();
        void reader?.cancel().catch(() => {});
        resolve(null);
      }, FETCH_TIMEOUT_MS);
    });
    const fetchMetadata = async (): Promise<TShopListingMetadata | null> => {
      // Runtime configuration, never Host/X-Forwarded-Host or a user-supplied origin.
      const url = new URL(route.embedPath, getDefaultUrl());
      const response = await safeFetch(
        url.href,
        {
          credentials: 'omit',
          redirect: 'error',
          cache: 'no-store',
          signal: abort.signal,
          // Next resolves metadata before returning HTML to this preview crawler.
          headers: { Accept: 'text/html', 'User-Agent': 'facebookexternalhit/1.1' },
        },
        ErrorService.Shop,
        'fetchListingMetadata',
      );
      if (abort.signal.aborted || !response.ok || !response.headers.get('content-type')?.includes('text/html')) {
        void response.body?.cancel().catch(() => {});
        return null;
      }

      reader = response.body?.getReader();
      if (!reader) return null;
      const decoder = new TextDecoder();
      let html = '';
      let bytes = 0;
      try {
        while (!abort.signal.aborted) {
          const { done, value } = await reader.read();
          if (done) return abort.signal.aborted ? null : extractShopMetadata(html + decoder.decode(), url);
          bytes += value.byteLength;
          if (bytes > MAX_HTML_BYTES) {
            void reader.cancel().catch(() => {});
            return null;
          }
          html += decoder.decode(value, { stream: true });
        }
        return null;
      } finally {
        reader.releaseLock();
      }
    };

    try {
      // A stalled fetch/body must not hold generateMetadata open, even if cancellation is ignored.
      return await Promise.race([fetchMetadata().catch(() => null), deadline]);
    } finally {
      clearTimeout(timer);
    }
  }
}
