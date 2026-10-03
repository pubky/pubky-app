import { AUTH_FLOW_CANCELED_ERROR_NAME, createCanceledError } from '@/libs/error/auth-flow-canceled';
import { AppError } from '@/libs/error/error';
import { AuthErrorCode, NetworkErrorCode, ServerErrorCode, ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { httpStatusCodeToError } from '@/libs/error/error.http';
import { ErrorService } from '@/libs/error/error.types';
import { HttpStatusCode } from '@/libs/http/http.types';
import type {
  THandleErrorParams,
  THandleTypedErrorParams,
  TThrowHomeserverErrorParams,
  TThrowInvalidInputErrorParams,
  TThrowPkarrLookupErrorParams,
  TThrowSessionExpiredErrorParams,
} from './homeserver.types';

// The cancellation sentinel is layer-neutral (`@/libs/error/auth-flow-canceled`); re-exported here
// so the service keeps its existing surface.
export { AUTH_FLOW_CANCELED_ERROR_NAME, createCanceledError };

/** Pubky SDK error names for type-safe error handling */
const PUBKY_ERROR_NAMES = {
  INVALID_INPUT: 'InvalidInput',
  AUTHENTICATION_ERROR: 'AuthenticationError',
  /** PKARR lookup itself failed (relay/network error or malformed record) — absence NOT proven */
  PKARR_ERROR: 'PkarrError',
} as const;

/**
 * Extracts status code from error objects (checks error directly first, then nested data)
 * @param error - The error to extract status code from
 * @returns The status code if found, undefined otherwise
 */
export const extractStatusCode = (error: unknown): number | undefined => {
  if (typeof error !== 'object' || error === null) return undefined;

  if ('statusCode' in error && typeof (error as { statusCode?: unknown }).statusCode === 'number') {
    return (error as { statusCode: number }).statusCode;
  }

  if (!('data' in error)) return undefined;
  const data = (error as { data?: unknown }).data;
  if (typeof data !== 'object' || data === null) return undefined;
  if (!('statusCode' in data)) return undefined;
  const statusCode = (data as { statusCode?: unknown }).statusCode;
  return typeof statusCode === 'number' ? statusCode : undefined;
};

/**
 * Type guard to check if an error has the shape of a Pubky error
 * @param error - The error to check
 * @returns True if the error has Pubky error shape, false otherwise
 */
export const isPubkyErrorLike = (error: unknown): error is { name: string; message: string; data?: unknown } => {
  if (typeof error !== 'object' || error === null) return false;
  return (
    'name' in error &&
    typeof (error as { name?: unknown }).name === 'string' &&
    'message' in error &&
    typeof (error as { message?: unknown }).message === 'string'
  );
};

/**
 * True when the SDK rejected with `PkarrError`: a PKARR lookup or publish failed. Carries no
 * HTTP status, so it never says anything about what the homeserver did.
 * @param error - The error to check
 * @returns True for an SDK `PkarrError`, false for anything else
 */
export const isPkarrError = (error: unknown): boolean =>
  isPubkyErrorLike(error) && error.name === PUBKY_ERROR_NAMES.PKARR_ERROR;

/**
 * One-line description of an SDK or JS error for log lines and error context. SDK errors are
 * plain `{ name, message }` objects, so `String(error)` alone would yield "[object Object]".
 * @param error - The error to describe
 * @returns `name: message` for error-like values, `String(error)` otherwise
 */
export const describeError = (error: unknown): string =>
  isPubkyErrorLike(error) ? `${error.name}: ${error.message}` : String(error);

/**
 * Throws a SESSION_EXPIRED error for authentication failures.
 * @param errorMessage - The original error message
 * @param additionalContext - Additional context to add to the error
 * @returns Never (always throws)
 */
const throwSessionExpiredError = ({ errorMessage, additionalContext }: TThrowSessionExpiredErrorParams): never => {
  throw Err.auth(AuthErrorCode.SESSION_EXPIRED, errorMessage || 'Session expired', {
    service: ErrorService.Homeserver,
    operation: (additionalContext.operation as string | undefined) ?? 'unknown',
    context: { originalError: errorMessage, ...additionalContext },
  });
};

/**
 * Throws an INVALID_INPUT error for validation failures.
 * @param errorMessage - The original error message
 * @param additionalContext - Additional context to add to the error
 * @returns Never (always throws)
 */
const throwInvalidInputError = ({ errorMessage, additionalContext }: TThrowInvalidInputErrorParams): never => {
  throw Err.validation(ValidationErrorCode.INVALID_INPUT, errorMessage, {
    service: ErrorService.Homeserver,
    operation: (additionalContext.operation as string | undefined) ?? 'unknown',
    context: { originalError: errorMessage, ...additionalContext },
  });
};

/**
 * Throws a retryable Network error for a failed PKARR lookup.
 *
 * The SDK rejects with `PkarrError` when the record could not be resolved (relay or
 * network failure, malformed record). That is not proof the record is absent, so the
 * error stays retryable and is never treated as a homeserver HTTP failure.
 *
 * @param errorMessage - The original error message
 * @param additionalContext - Additional context to add to the error
 * @returns Never (always throws)
 */
const throwPkarrLookupError = ({ errorMessage, additionalContext }: TThrowPkarrLookupErrorParams): never => {
  throw Err.network(NetworkErrorCode.CONNECTION_FAILED, errorMessage || 'PKARR lookup failed', {
    service: ErrorService.Homeserver,
    operation: (additionalContext.operation as string | undefined) ?? 'unknown',
    context: { originalError: errorMessage, ...additionalContext },
  });
};

/**
 * Throws a homeserver error with the provided context.
 * Uses httpStatusCodeToError for proper HTTP status code mapping.
 * @param statusCode - The HTTP status code
 * @param errorMessage - The original error message
 * @param additionalContext - Additional context to add to the error
 * @returns Never (always throws)
 */
const throwHomeserverError = ({ statusCode, errorMessage, additionalContext }: TThrowHomeserverErrorParams): never => {
  const operation = (additionalContext.operation as string | undefined) ?? 'unknown';
  const url = (additionalContext.url as string | undefined) ?? 'unknown';

  throw httpStatusCodeToError(statusCode, errorMessage, ErrorService.Homeserver, operation, url);
};

/**
 * Handles typed errors by transforming them into appropriate AppError types.
 * Routes to specialized throwers based on error name and status code.
 *
 * @param errorMessage - The original error message
 * @param errorName - The error name (e.g., 'InvalidInput', 'AuthenticationError', 'PkarrError')
 * @param statusCode - The HTTP status code
 * @param additionalContext - Additional context to add to the error
 * @returns Never (always throws)
 */
const handleTypedError = ({
  errorMessage,
  errorName,
  statusCode,
  additionalContext,
}: THandleTypedErrorParams): never => {
  if (errorName === PUBKY_ERROR_NAMES.INVALID_INPUT) {
    return throwInvalidInputError({ errorMessage, additionalContext });
  }

  // A PKARR failure carries no HTTP status, so it must be dispatched by name before
  // the status-based fallbacks below turn it into a synthetic 500 homeserver error.
  if (errorName === PUBKY_ERROR_NAMES.PKARR_ERROR) {
    return throwPkarrLookupError({ errorMessage, additionalContext });
  }

  if (errorName === PUBKY_ERROR_NAMES.AUTHENTICATION_ERROR || statusCode === HttpStatusCode.UNAUTHORIZED) {
    return throwSessionExpiredError({ errorMessage, additionalContext });
  }

  return throwHomeserverError({ statusCode, errorMessage, additionalContext });
};

/**
 * Handles errors from the homeserver.
 * Transforms various error types into standardized AppError instances.
 *
 * @param error - The error to handle
 * @param additionalContext - Additional context to add to the error
 * @param statusCode - Fallback status code if not extractable from error (default: 500)
 * @param alwaysUseHomeserverError - Whether to always use the homeserver error
 * @returns Never (always throws)
 */
export const handleError = ({
  error,
  additionalContext = {},
  statusCode = HttpStatusCode.INTERNAL_SERVER_ERROR,
  alwaysUseHomeserverError = false,
}: THandleErrorParams): never => {
  // Re-throw existing AppErrors as-is
  if (error instanceof AppError) {
    throw error;
  }

  const resolvedStatusCode = extractStatusCode(error) ?? statusCode;

  // Handle Pubky SDK errors
  if (isPubkyErrorLike(error)) {
    return handleTypedError({
      errorMessage: error.message,
      errorName: error.name,
      statusCode: resolvedStatusCode,
      additionalContext,
    });
  }

  // Handle standard JavaScript errors
  if (error instanceof Error) {
    return handleTypedError({
      errorMessage: error.message,
      errorName: undefined,
      statusCode: resolvedStatusCode,
      additionalContext,
    });
  }

  // Handle unknown error types
  if (alwaysUseHomeserverError) {
    return throwHomeserverError({ statusCode: resolvedStatusCode, errorMessage: String(error), additionalContext });
  }

  const errorMessage = String(error);

  throw Err.server(ServerErrorCode.UNKNOWN_ERROR, errorMessage, {
    service: ErrorService.Homeserver,
    operation: (additionalContext.operation as string | undefined) ?? 'unknown',
    context: { statusCode: resolvedStatusCode, ...additionalContext },
    cause: error,
  });
};
