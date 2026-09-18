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
 * How long one 429 report covers its `service:operation`.
 *
 * A throttled client keeps issuing queries, and the query client retries a 429 once
 * after the 429 backoff, so a single server-side throttling window used to produce one
 * Sentry event per request and per attempt — ~8.7k events for a handful of windows
 * (PUBKY-APP-B3 on /hot, PUBKY-APP-9X on /home). Reporting the first 429 per minute per
 * operation keeps throttling visible without the multiplication.
 */
const RATE_LIMIT_REPORT_WINDOW_MS = 60_000;

/**
 * Cap on remembered `service:operation` keys. Services are enum-shaped and operations are
 * literal call-site strings, so this only guards a pathologically long-lived client.
 */
const RATE_LIMIT_REPORT_KEYS_MAX = 100;

/** Last reported 429 per `service:operation`, in epoch ms. */
const lastRateLimitReportAt = new Map<string, number>();

/**
 * Claims the 429 report slot for `service:operation`.
 *
 * @param service - Which service produced the 429
 * @param operation - Which operation failed
 * @param nowMs - Reference time in milliseconds (for testability)
 * @returns `true` when this 429 is the first for its operation in the current window (report
 * it), `false` when an earlier 429 already reported that operation (suppress the report)
 */
export function claimRateLimitReport(service: ErrorService, operation: string, nowMs: number = Date.now()): boolean {
  const key = `${service}:${operation}`;
  const lastReportedAt = lastRateLimitReportAt.get(key);

  if (lastReportedAt !== undefined && nowMs - lastReportedAt < RATE_LIMIT_REPORT_WINDOW_MS) {
    return false;
  }

  if (lastRateLimitReportAt.size >= RATE_LIMIT_REPORT_KEYS_MAX) {
    const oldestKey = lastRateLimitReportAt.keys().next().value;
    if (oldestKey !== undefined) lastRateLimitReportAt.delete(oldestKey);
  }
  lastRateLimitReportAt.set(key, nowMs);

  return true;
}

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
    // One throttling condition, not one failure per request: the first 429 for a
    // service/operation reaches Sentry, the repeats are tagged so the
    // `rate-limit-repeat-reports` drop rule suppresses them. The error itself is still
    // built and thrown, so retry and UX behaviour are unchanged.
    const reportSuppressed = !claimRateLimitReport(service, operation);

    return Err.rateLimit(RateLimitErrorCode.RATE_LIMITED, message, {
      ...baseParams,
      context: { ...baseParams.context, retryAfter, ...(reportSuppressed && { reportSuppressed: true }) },
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

function findAppError(error: unknown): AppError | null {
  const seen = new Set<unknown>();
  let current = error;

  while (current && typeof current === 'object' && !seen.has(current)) {
    if (current instanceof AppError) return current;

    seen.add(current);
    current = 'cause' in current ? current.cause : undefined;
  }

  return null;
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
    // Fetch implementations such as Undici may wrap connection-hook errors in TypeError.cause.
    const appError = findAppError(error);
    if (appError) throw appError;

    // Aborted requests. `signalAborted` records whether the caller's own AbortSignal fired
    // (deliberate cancellation) as opposed to a browser-driven abort with no signal; the
    // `aborted-requests` Sentry drop rule keys on it.
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw Err.timeout(TimeoutErrorCode.REQUEST_ABORTED, 'Request was aborted', {
        service,
        operation,
        context: { url, signalAborted: options.signal?.aborted === true },
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
