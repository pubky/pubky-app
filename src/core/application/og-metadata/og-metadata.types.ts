import { HttpStatusCode } from '@/libs/http/http.types';

/**
 * Input parameters for OG metadata fetching.
 * `url` comes from searchParams.get(), so it can be string or null.
 */
export interface TOgMetadataParams {
  url: string | null;
}

/**
 * Normalized OG metadata result.
 * For media URLs (image/video/audio), only `url` and `type` are set.
 * For websites, all fields are populated (title/image may be null if not found).
 */
export interface TOgMetadataResult {
  url: string;
  type: 'website' | 'image' | 'video' | 'audio';
  title?: string | null;
  image?: string | null;
}

export type TOgMetadataFallbackReason = 'http_error' | 'non_html' | 'dns_failed' | 'network' | 'timeout' | 'rate_limit';

export type TOgMetadataFetchOutcome =
  | { kind: 'success'; metadata: TOgMetadataResult; cachePolicy: 'normal' }
  | {
      kind: 'durable-fallback';
      metadata: TOgMetadataResult;
      fallbackReason: Extract<TOgMetadataFallbackReason, 'http_error' | 'non_html'>;
      cachePolicy: 'normal';
    }
  | {
      kind: 'transient-fallback';
      statusCode:
        | HttpStatusCode.REQUEST_TIMEOUT
        | HttpStatusCode.TOO_MANY_REQUESTS
        | HttpStatusCode.SERVICE_UNAVAILABLE;
      fallbackReason: Exclude<TOgMetadataFallbackReason, 'non_html'>;
      cachePolicy: 'no-store';
    };
