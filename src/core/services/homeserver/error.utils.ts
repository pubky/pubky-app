import { AppError } from '@/libs/error/error';
import { AuthErrorCode, ServerErrorCode, ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { httpStatusCodeToError } from '@/libs/error/error.http';
import { ErrorService } from '@/libs/error/error.types';
import { HttpStatusCode } from '@/libs/http/http.types';
import type {
  THandleErrorParams,
  THandleTypedErrorParams,
  TThrowHomeserverErrorParams,
  TThrowInvalidInputErrorParams,
  TThrowSessionExpiredErrorParams,
} from './homeserver.types';

export const AUTH_FLOW_CANCELED_ERROR_NAME = 'AuthFlowCanceled';

/** Pubky SDK error names for type-safe error handling */
const PUBKY_ERROR_NAMES = {
  INVALID_INPUT: 'InvalidInput',
  AUTHENTICATION_ERROR: 'AuthenticationError',
} as const;

const RETRYABLE_STATUS_CODES = [
  HttpStatusCode.NOT_FOUND,
  HttpStatusCode.REQUEST_TIMEOUT,
  HttpStatusCode.TOO_MANY_REQUESTS,
  HttpStatusCode.INTERNAL_SERVER_ERROR,
  HttpStatusCode.BAD_GATEWAY,
  HttpStatusCode.SERVICE_UNAVAILABLE,
  HttpStatusCode.GATEWAY_TIMEOUT,
] as const;

type RetryableStatusCode = (typeof RETRYABLE_STATUS_CODES)[number];

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
 * Checks if a relay poll error is retryable based on status code or error message
 * @param error - The error to check
 * @returns True if the error is retryable, false otherwise
 */
export const isRetryableRelayPollError = (error: unknown): boolean => {
  if (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name?: unknown }).name === 'RequestError'
  ) {
    const statusCode = extractStatusCode(error);
    // No status code typically means a network-level failure (DNS, connection refused, etc.)
    // These are transient issues worth retrying during auth polling
    if (!statusCode) return true;
    return RETRYABLE_STATUS_CODES.includes(statusCode as RetryableStatusCode);
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (message.includes('timed out') || message.includes('timeout')) return true;
    if (message.includes(HttpStatusCode.GATEWAY_TIMEOUT.toString()) || message.includes('gateway')) return true;
  }

  return false;
};

/**
 * Creates a canceled error for auth flows.
 *
 * Uses plain Error (not AppError) intentionally — cancellation is a control flow
 * signal, not an actual error. It's caught by name and handled as a normal exit path.
 *
 * @returns An Error with the canceled error name
 */
export const createCanceledError = (): Error => {
  const error = new Error('Auth flow canceled');
  error.name = AUTH_FLOW_CANCELED_ERROR_NAME;
  return error;
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
 * @param errorName - The error name (e.g., 'InvalidInput', 'AuthenticationError')
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
