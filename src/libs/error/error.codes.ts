import { ErrorCategory } from './error.types';

// =============================================================================
// Error Codes by Category (as enums for consistency with ErrorCategory/ErrorService)
// =============================================================================

/**
 * Network errors (connection-level failures)
 */
export enum NetworkErrorCode {
  OFFLINE = 'OFFLINE',
  DNS_FAILED = 'DNS_FAILED',
  CONNECTION_REFUSED = 'CONNECTION_REFUSED',
  CONNECTION_RESET = 'CONNECTION_RESET',
  /** Generic network failure (fetch threw) */
  CONNECTION_FAILED = 'CONNECTION_FAILED',
}

/**
 * Timeout errors
 */
export enum TimeoutErrorCode {
  REQUEST_TIMEOUT = 'REQUEST_TIMEOUT',
  GATEWAY_TIMEOUT = 'GATEWAY_TIMEOUT',
  /** Request was aborted via AbortSignal */
  REQUEST_ABORTED = 'REQUEST_ABORTED',
}

/**
 * Server errors (5xx from any service)
 */
export enum ServerErrorCode {
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  BAD_GATEWAY = 'BAD_GATEWAY',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
  /** Response was received but body was empty or malformed */
  INVALID_RESPONSE = 'INVALID_RESPONSE',
}

/**
 * Client errors (4xx)
 */
export enum ClientErrorCode {
  BAD_REQUEST = 'BAD_REQUEST',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  GONE = 'GONE',
  UNPROCESSABLE = 'UNPROCESSABLE',
  PAYLOAD_TOO_LARGE = 'PAYLOAD_TOO_LARGE',
}

/**
 * Auth errors
 */
export enum AuthErrorCode {
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  INVALID_TOKEN = 'INVALID_TOKEN',
  /** User's PKARR homeserver does not match this staging deploy's configured homeserver */
  WRONG_ENVIRONMENT_HOMESERVER = 'WRONG_ENVIRONMENT_HOMESERVER',
}

/**
 * Rate limit errors
 */
export enum RateLimitErrorCode {
  RATE_LIMITED = 'RATE_LIMITED',
  BLOCKED = 'BLOCKED',
}

/**
 * Validation errors (local, before request)
 */
export enum ValidationErrorCode {
  INVALID_INPUT = 'INVALID_INPUT',
  MISSING_FIELD = 'MISSING_FIELD',
  TYPE_ERROR = 'TYPE_ERROR',
  FORMAT_ERROR = 'FORMAT_ERROR',
}

/**
 * Database errors (local storage)
 */
export enum DatabaseErrorCode {
  QUERY_FAILED = 'QUERY_FAILED',
  WRITE_FAILED = 'WRITE_FAILED',
  DELETE_FAILED = 'DELETE_FAILED',
  RECORD_NOT_FOUND = 'RECORD_NOT_FOUND',
  TRANSACTION_FAILED = 'TRANSACTION_FAILED',
  SCHEMA_ERROR = 'SCHEMA_ERROR',
  INIT_FAILED = 'INIT_FAILED',
  /** Invariant violation - data integrity issue (e.g., record not found after successful creation) */
  INTEGRITY_ERROR = 'INTEGRITY_ERROR',
}

/**
 * Union of all error codes
 */
export type ErrorCode =
  | NetworkErrorCode
  | TimeoutErrorCode
  | ServerErrorCode
  | ClientErrorCode
  | AuthErrorCode
  | RateLimitErrorCode
  | ValidationErrorCode
  | DatabaseErrorCode;

/**
 * Maps each category to its valid error codes.
 * Single source of truth for category-code relationships.
 * Enables compile-time enforcement of valid combinations.
 */
export type ErrorCodeByCategory = {
  [ErrorCategory.Network]: NetworkErrorCode;
  [ErrorCategory.Timeout]: TimeoutErrorCode;
  [ErrorCategory.Server]: ServerErrorCode;
  [ErrorCategory.Client]: ClientErrorCode;
  [ErrorCategory.Auth]: AuthErrorCode;
  [ErrorCategory.RateLimit]: RateLimitErrorCode;
  [ErrorCategory.Validation]: ValidationErrorCode;
  [ErrorCategory.Database]: DatabaseErrorCode;
};
