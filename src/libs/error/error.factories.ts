import { AppError, type AppErrorParams } from './error';
import { ErrorCategory, ErrorService } from './error.types';
import { Logger } from '../logger/logger';
import type {
  ErrorCodeByCategory,
  NetworkErrorCode,
  TimeoutErrorCode,
  ServerErrorCode,
  ClientErrorCode,
  AuthErrorCode,
  RateLimitErrorCode,
  ValidationErrorCode,
  DatabaseErrorCode,
} from './error.codes';

/**
 * Common parameters for all error factories.
 */
type FactoryParams = {
  /** Which service produced the error (for logging/filtering) */
  service: ErrorService;
  /** Which operation failed (for logging) */
  operation: string;
  /** Original thrown value for debugging */
  cause?: unknown;
  /** Additional context data (endpoint, table, statusCode, retryAfter, etc.) */
  context?: Record<string, unknown>;
  /** Correlates errors across the call chain (set by Application layer) */
  traceId?: string;
};

/**
 * Helper function to create AppError with common pattern.
 * Reduces boilerplate in each factory method.
 *
 * Note: Type assertion is safe here because each factory method enforces
 * the correct category-code relationship via its typed signature.
 */
function createAppError<C extends ErrorCategory>(
  category: C,
  code: ErrorCodeByCategory[C],
  message: string,
  params: FactoryParams,
): AppError {
  const error = new AppError({
    category,
    code,
    message,
    service: params.service,
    operation: params.operation,
    context: params.context,
    cause: params.cause,
    traceId: params.traceId,
  } as AppErrorParams);

  Logger.error(`[${params.service}:${params.operation}]`, error.message, params.context);

  // We could send to sentry error here
  // Sentry.captureException(err);

  return error;
}

/**
 * Error factories organized by category.
 *
 * Usage:
 * ```typescript
 * // Remote service error
 * throw Err.server('SERVICE_UNAVAILABLE', 'Service unavailable', {
 *   service: ErrorService.Homegate,
 *   operation: 'verifySmsCode',
 *   context: { endpoint: url, statusCode: 503 },
 * });
 */
export const Err = {
  /**
   * Creates a network error (connection-level failures).
   * Examples: offline, DNS failed, connection refused/reset
   */
  network: (code: NetworkErrorCode, message: string, params: FactoryParams): AppError =>
    createAppError(ErrorCategory.Network, code, message, params),

  /**
   * Creates a timeout error.
   * Examples: request timeout (408), gateway timeout (504)
   */
  timeout: (code: TimeoutErrorCode, message: string, params: FactoryParams): AppError =>
    createAppError(ErrorCategory.Timeout, code, message, params),

  /**
   * Creates a server error (5xx from any service).
   * Examples: internal error (500), bad gateway (502), service unavailable (503)
   */
  server: (code: ServerErrorCode, message: string, params: FactoryParams): AppError =>
    createAppError(ErrorCategory.Server, code, message, params),

  /**
   * Creates a client error (4xx).
   * Examples: bad request (400), not found (404), conflict (409)
   */
  client: (code: ClientErrorCode, message: string, params: FactoryParams): AppError =>
    createAppError(ErrorCategory.Client, code, message, params),

  /**
   * Creates an auth error.
   * Examples: unauthorized (401), forbidden (403), session expired
   */
  auth: (code: AuthErrorCode, message: string, params: FactoryParams): AppError =>
    createAppError(ErrorCategory.Auth, code, message, params),

  /**
   * Creates a rate limit error.
   * Examples: rate limited (429), blocked
   * Tip: Include `retryAfter` in context for retry logic
   */
  rateLimit: (code: RateLimitErrorCode, message: string, params: FactoryParams): AppError =>
    createAppError(ErrorCategory.RateLimit, code, message, params),

  /**
   * Creates a validation error (local, before request).
   * Examples: invalid input, missing field, type error
   */
  validation: (code: ValidationErrorCode, message: string, params: FactoryParams): AppError =>
    createAppError(ErrorCategory.Validation, code, message, params),

  /**
   * Creates a database error (local storage failures).
   * Examples: query failed, write failed, record not found
   */
  database: (code: DatabaseErrorCode, message: string, params: FactoryParams): AppError =>
    createAppError(ErrorCategory.Database, code, message, params),
};
