import { HttpStatusCode } from '../http/http.types';
import { parseRetryAfterHeader } from '../http/response.utils';
import { AppError } from './error';
import {
  AuthErrorCode,
  ClientErrorCode,
  NetworkErrorCode,
  RateLimitErrorCode,
  ServerErrorCode,
  TimeoutErrorCode,
} from './error.codes';
import { Err } from './error.factories';
import { ErrorService } from './error.types';

/**
 * Creates appropriate AppError from HTTP status code.
 * Primary mapping function used by httpResponseToError and for cases
 * where you have a status code without a Response object.
 *
 * @param statusCode - The HTTP status code
 * @param message - Error message (e.g., statusText)
 * @param service - Which service produced the error
 * @param operation - Which operation failed
 * @param endpoint - The endpoint URL (for context)
 * @param retryAfter - Optional retry-after value for rate limit errors
 * @returns AppError with appropriate category and code based on status
 *
 * @example
 * ```typescript
 * throw httpStatusCodeToError(404, 'Not Found', ErrorService.Homeserver, 'getUser', '/users/123');
 * ```
 */
export function httpStatusCodeToError(
  statusCode: number,
  message: string,
  service: ErrorService,
  operation: string,
  endpoint: string,
  retryAfter?: number,
): AppError {
  const baseParams = { service, operation, context: { endpoint, statusCode } };

  // 5xx Server Errors
  if (statusCode >= HttpStatusCode.INTERNAL_SERVER_ERROR) {
    if (statusCode === HttpStatusCode.GATEWAY_TIMEOUT) {
      return Err.timeout(TimeoutErrorCode.GATEWAY_TIMEOUT, message, baseParams);
    }
    const code =
      statusCode === HttpStatusCode.SERVICE_UNAVAILABLE
        ? ServerErrorCode.SERVICE_UNAVAILABLE
        : statusCode === HttpStatusCode.BAD_GATEWAY
          ? ServerErrorCode.BAD_GATEWAY
          : ServerErrorCode.INTERNAL_ERROR;
    return Err.server(code, message, baseParams);
  }

  // 429 Rate Limited
  if (statusCode === HttpStatusCode.TOO_MANY_REQUESTS) {
    return Err.rateLimit(RateLimitErrorCode.RATE_LIMITED, message, {
      ...baseParams,
      context: { ...baseParams.context, retryAfter },
    });
  }

  // 401/403 Auth Errors
  if (statusCode === HttpStatusCode.UNAUTHORIZED) {
    return Err.auth(AuthErrorCode.UNAUTHORIZED, message, baseParams);
  }
  if (statusCode === HttpStatusCode.FORBIDDEN) {
    return Err.auth(AuthErrorCode.FORBIDDEN, message, baseParams);
  }

  // 408 Timeout
  if (statusCode === HttpStatusCode.REQUEST_TIMEOUT) {
    return Err.timeout(TimeoutErrorCode.REQUEST_TIMEOUT, message, baseParams);
  }

  // 404 Not Found
  if (statusCode === HttpStatusCode.NOT_FOUND) {
    return Err.client(ClientErrorCode.NOT_FOUND, message, baseParams);
  }

  // 409 Conflict
  if (statusCode === HttpStatusCode.CONFLICT) {
    return Err.client(ClientErrorCode.CONFLICT, message, baseParams);
  }

  // 413 Payload Too Large
  if (statusCode === HttpStatusCode.PAYLOAD_TOO_LARGE) {
    return Err.client(ClientErrorCode.PAYLOAD_TOO_LARGE, message, baseParams);
  }

  // 410 Gone
  if (statusCode === HttpStatusCode.GONE) {
    return Err.client(ClientErrorCode.GONE, message, baseParams);
  }

  // 422 Unprocessable
  if (statusCode === HttpStatusCode.UNPROCESSABLE_ENTITY) {
    return Err.client(ClientErrorCode.UNPROCESSABLE, message, baseParams);
  }

  // Other 4xx
  if (statusCode >= HttpStatusCode.BAD_REQUEST) {
    return Err.client(ClientErrorCode.BAD_REQUEST, message, baseParams);
  }

  // Fallback for unexpected status codes
  return Err.server(ServerErrorCode.UNKNOWN_ERROR, message, baseParams);
}

/**
 * Creates appropriate AppError from HTTP response.
 * Convenience wrapper around httpStatusCodeToError for Response objects.
 *
 * @param response - The HTTP Response object
 * @param service - Which service produced the error
 * @param operation - Which operation failed
 * @param endpoint - The endpoint URL (for context)
 * @returns AppError with appropriate category and code based on status
 *
 * @example
 * ```typescript
 * if (!response.ok) {
 *   throw httpResponseToError(response, ErrorService.Homegate, 'verifySmsCode', url);
 * }
 * ```
 */
export function httpResponseToError(
  response: Response,
  service: ErrorService,
  operation: string,
  endpoint: string,
): AppError {
  const { status, statusText } = response;
  const retryAfter = parseRetryAfterHeader(response.headers.get('retry-after'));

  return httpStatusCodeToError(status, statusText || 'Request failed', service, operation, endpoint, retryAfter);
}

/**
 * Attempts to detect the specific network error type from fetch() failures.
 * Browsers intentionally limit error details (especially for CORS), so this
 * is best-effort detection.
 *
 * @param error - The error thrown by fetch()
 * @returns The most specific NetworkErrorCode we can determine
 */
function detectNetworkErrorCode(error: unknown): NetworkErrorCode {
  // Check if user is offline (most reliable detection)
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return NetworkErrorCode.OFFLINE;
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    if (message.includes('enotfound') || message.includes('getaddrinfo')) {
      return NetworkErrorCode.DNS_FAILED;
    }
    if (message.includes('econnrefused') || message.includes('connection refused')) {
      return NetworkErrorCode.CONNECTION_REFUSED;
    }
    if (message.includes('econnreset') || message.includes('connection reset')) {
      return NetworkErrorCode.CONNECTION_RESET;
    }
  }

  // Default to generic connection failed
  return NetworkErrorCode.CONNECTION_FAILED;
}

/**
 * Wraps fetch() to convert network-level errors into AppError.
 * Use this instead of raw fetch() in service layers to ensure
 * all errors are properly typed for retry logic and error handling.
 *
 * @param url - Request URL
 * @param options - Fetch options (RequestInit)
 * @param service - Which service is making the request
 * @param operation - Which operation is being performed
 * @returns Response object if successful
 * @throws AppError for network failures and abort/timeout
 *
 * @example
 * ```typescript
 * const response = await safeFetch(url, { method: 'GET' }, ErrorService.Nexus, 'fetchUser');
 * if (!response.ok) {
 *   throw httpResponseToError(response, ErrorService.Nexus, 'fetchUser', url);
 * }
 * ```
 */
export async function safeFetch(
  url: string,
  options: RequestInit,
  service: ErrorService,
  operation: string,
): Promise<Response> {
  try {
    return await fetch(url, options);
  } catch (error) {
    // Already an AppError - re-throw as-is
    if (error instanceof AppError) {
      throw error;
    }

    // Aborted requests (user cancellation or signal timeout)
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw Err.timeout(TimeoutErrorCode.REQUEST_ABORTED, 'Request was aborted', {
        service,
        operation,
        context: { url },
        cause: error,
      });
    }

    // Network failures - try to determine specific type
    const errorCode = detectNetworkErrorCode(error);
    const message = error instanceof Error ? error.message : 'Network request failed';

    throw Err.network(errorCode, message, {
      service,
      operation,
      context: { url, offline: typeof navigator !== 'undefined' ? !navigator.onLine : undefined },
      cause: error,
    });
  }
}
