import { ArgumentError, ValidationError } from 'pubky-social-specs';
import { AppError } from '@/libs/error/error';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';

/**
 * A refusal of `pubky-social-specs` as the validation `AppError` this app throws: the package's
 * words, and for a rule of the data model its structured `code`, `field` and `limit` (an
 * `ArgumentError` names only its `field`). An `AppError` passes through untouched, so a caller can
 * wrap a block that throws its own. Pure.
 */
export function toSpecsValidationError(error: unknown, operation: string, context: Record<string, unknown>): AppError {
  if (error instanceof AppError) return error;
  const refusal =
    error instanceof ValidationError
      ? { code: error.code, field: error.field, limit: error.limit }
      : error instanceof ArgumentError
        ? { field: error.field }
        : {};
  return Err.validation(ValidationErrorCode.INVALID_INPUT, error instanceof Error ? error.message : String(error), {
    service: ErrorService.SocialSpecs,
    operation,
    context: { ...context, ...refusal },
    cause: error,
  });
}
