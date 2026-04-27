import { ServerErrorCode } from '../error/error.codes';
import { Err } from '../error/error.factories';
import { ErrorService } from '../error/error.types';

/**
 * Parses response body as JSON, throws AppError if parsing fails.
 * Generic utility that can be used across different services.
 *
 * @param response - Response object to parse
 * @param service - The service to attribute errors to
 * @param operation - The operation name for error context
 * @param url - Optional endpoint URL for error context
 * @returns Parsed JSON data
 * @throws {AppError} When response body is empty or not valid JSON
 */
export async function parseResponseOrThrow<T>(
  response: Response,
  service: ErrorService,
  operation: string,
  url?: string,
): Promise<T> {
  const text = await response.text();

  if (!text || text.trim() === '') {
    throw Err.server(ServerErrorCode.INVALID_RESPONSE, 'Response body is empty (expected JSON)', {
      service,
      operation,
      context: { statusCode: response.status, ...(url && { endpoint: url }) },
    });
  }

  try {
    return JSON.parse(text) as T;
  } catch (error) {
    throw Err.server(ServerErrorCode.INVALID_RESPONSE, 'Failed to parse JSON response', {
      service,
      operation,
      context: { statusCode: response.status, responseText: text.slice(0, 200), ...(url && { endpoint: url }) },
      cause: error,
    });
  }
}

/**
 * Parses Retry-After header into delay seconds.
 * Supports either delta-seconds ("120") or HTTP-date format.
 *
 * @param retryAfterHeader - Header value from response
 * @param nowMs - Reference time in milliseconds (for testability)
 * @returns Delay in seconds, or undefined when invalid/missing
 */
export function parseRetryAfterHeader(retryAfterHeader: string | null, nowMs: number = Date.now()): number | undefined {
  if (!retryAfterHeader) return undefined;

  const value = retryAfterHeader.trim();
  if (!value) return undefined;

  // Retry-After: <delay-seconds>
  if (/^\d+$/.test(value)) {
    return Number.parseInt(value, 10);
  }

  // Retry-After: <http-date>
  const retryAtMs = Date.parse(value);
  if (Number.isNaN(retryAtMs)) {
    return undefined;
  }

  return Math.max(0, Math.ceil((retryAtMs - nowMs) / 1000));
}
