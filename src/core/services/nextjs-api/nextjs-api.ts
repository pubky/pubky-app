import { Err, ErrorService, TimeoutErrorCode, ServerErrorCode } from '@/libs';

const FETCH_TIMEOUT_MS = 10_000;

const FETCH_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: 'text/html, image/*, video/*, audio/*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Upgrade-Insecure-Requests': '1',
};

/**
 * Next.js API service.
 *
 * Provides server-side HTTP operations with SSRF protections.
 * Used by the application layer for fetching external resources.
 */
export class NextJsApiService {
  private constructor() {}

  /**
   * Fetches a URL with timeout and browser-like headers.
   *
   * @param url - The URL to fetch
   * @returns The raw Response object
   * @throws AppError with TimeoutErrorCode.REQUEST_TIMEOUT on timeout
   * @throws AppError with ServerErrorCode.UNKNOWN_ERROR on fetch failure
   */
  static async fetch(url: string): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: FETCH_HEADERS,
        redirect: 'follow',
      });

      return response;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw Err.timeout(TimeoutErrorCode.REQUEST_TIMEOUT, 'Request timeout', {
          service: ErrorService.NextJsApi,
          operation: 'fetch',
          context: { url, statusCode: 408 },
        });
      }

      throw Err.server(ServerErrorCode.UNKNOWN_ERROR, 'Fetch failed', {
        service: ErrorService.NextJsApi,
        operation: 'fetch',
        cause: error,
        context: { url, statusCode: 500 },
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
