import type { ErrorCode, ErrorCodeByCategory } from './error.codes';
import { ErrorCategory, ErrorService } from './error.types';

// =============================================================================
// AppError System
// =============================================================================

/**
 * Generic base type that enforces category-code relationship.
 */
type BaseAppErrorParams<C extends ErrorCategory> = {
  category: C;
  code: ErrorCodeByCategory[C];
  message: string;
  service: ErrorService;
  operation: string;
  context?: Record<string, unknown>;
  cause?: unknown;
  traceId?: string;
};

/**
 * Union of all valid category-code combinations.
 * Compile-time enforcement: cannot create Network error with Database code.
 */
export type AppErrorParams = {
  [C in ErrorCategory]: BaseAppErrorParams<C>;
}[ErrorCategory];

/**
 * Application error with category-based typing.
 *
 * IMPORTANT: Does NOT log on construction. Logging is handled by the `Err.*` factories.
 */
export class AppError extends Error {
  /** WHAT kind of failure — used for decision logic (retry, routing, login redirect) */
  readonly category?: ErrorCategory;

  /** WHICH specific error — enables precise handling (NOT_FOUND → empty state, CONFLICT → merge dialog) */
  readonly code?: ErrorCode;

  /** WHERE it happened (service) — for logging, filtering, debugging ("all Homegate errors") */
  readonly service?: ErrorService;

  /** WHERE it happened (operation) — traces exact code path ("readDetails", "verifySmsCode") */
  readonly operation?: string;

  /** EXTRA data — generic bag for variable context (endpoint, table, statusCode, retryAfter, etc.) */
  readonly context?: Record<string, unknown>;

  /** ROOT cause — preserves original thrown value for debugging (can be any thrown value, not just Error) */
  readonly cause?: unknown;

  /** TRACE ID — correlates all errors/logs from a single user operation*/
  traceId?: string;

  /**
   * Creates an AppError.
   *
   * @example
   * ```typescript
   * new AppError({
   *   category: ErrorCategory.Database,
   *   code: 'QUERY_FAILED',
   *   message: 'Failed to read post',
   *   service: ErrorService.Local,
   *   operation: 'readDetails',
   *   context: { table: 'postDetails', postId },
   *   cause: originalError,
   * });
   * ```
   */
  constructor(params: AppErrorParams) {
    super(params.message);
    this.name = 'AppError';
    this.category = params.category;
    this.code = params.code;
    this.service = params.service;
    this.operation = params.operation;
    this.context = params.context;
    this.cause = params.cause;
    this.traceId = params.traceId;

    // Maintain proper prototype chain
    Object.setPrototypeOf(this, AppError.prototype);

    // Capture stack trace, excluding constructor
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError);
    }
  }

  // ==========================================================================
  // Enrichment Methods
  // ==========================================================================

  /**
   * Sets the trace ID for error correlation.
   *
   * @param id - The trace ID to correlate this error with other logs/errors in the same operation
   * @returns this - For chaining (e.g., `throw toAppError(e, service, op).setTraceId(id)`)
   *
   * @example
   * ```typescript
   * catch (error) {
   *   const appError = toAppError(error, ErrorService.Nexus, 'fetchPost');
   *   appError.setTraceId(currentTraceId);
   *   Logger.error(appError);
   *   throw appError;
   * }
   *
   * // Or inline:
   * throw toAppError(error, service, operation).setTraceId(traceId);
   * ```
   */
  setTraceId(id: string): this {
    this.traceId = id;
    return this;
  }
}

/**
 * Type guard to check if an error is an AppError
 * @param error - The error to check
 * @returns True if the error is an AppError instance
 */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
