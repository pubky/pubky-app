import { buildUri } from 'pubky-social-specs';
import { fakeOwner } from 'pubky-social-specs/testing';
import { describe, expect, it } from 'vitest';
import { AppError } from '@/libs/error/error';
import { ClientErrorCode, ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { asInvalid } from '@/test-utils/type-assertions';
import { toSpecsValidationError } from './specs.errors';

const refusalOf = (run: () => unknown): unknown => {
  try {
    run();
  } catch (error) {
    return error;
  }
  return undefined;
};

describe('toSpecsValidationError', () => {
  it('carries a rule refusal with the package code and field', () => {
    const error = toSpecsValidationError(
      refusalOf(() => buildUri(fakeOwner(1), 'post', 'not-a-post-id')),
      'buildUri',
      { step: 'test' },
    );

    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({
      code: ValidationErrorCode.INVALID_INPUT,
      service: ErrorService.SocialSpecs,
      operation: 'buildUri',
      context: { step: 'test', code: 'format', field: 'id' },
    });
  });

  it('carries a misuse with its field alone', () => {
    const error = toSpecsValidationError(
      refusalOf(() => buildUri(fakeOwner(1), 'post', asInvalid<string>(42))),
      'buildUri',
      {},
    );

    expect(error.context).toEqual({ field: 'id' });
  });

  it('spells an unknown throwable and lets an AppError through untouched', () => {
    const own = Err.client(ClientErrorCode.NOT_FOUND, 'Post not found', {
      service: ErrorService.Local,
      operation: 'test',
    });

    expect(toSpecsValidationError(own, 'buildUri', {})).toBe(own);
    expect(toSpecsValidationError('refused', 'buildUri', {}).message).toBe('refused');
  });
});
