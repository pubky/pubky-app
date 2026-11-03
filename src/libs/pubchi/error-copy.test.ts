import { describe, expect, it } from 'vitest';
import { AppError } from '@/libs/error/error';
import { NetworkErrorCode, ServerErrorCode, TimeoutErrorCode, ValidationErrorCode } from '@/libs/error/error.codes';
import { ErrorCategory, ErrorService } from '@/libs/error/error.types';
import { PUBCHI_ERROR_CODES, PUBCHI_ERROR_COPY_BY_CODE, pubchiErrorCopy, pubchiQueryErrorCode } from './error-copy';
import { ERROR_CODES } from './schemas/codes';

describe('pubchiErrorCopy', () => {
  it('has human-readable copy for every vendored and service error code', () => {
    for (const code of PUBCHI_ERROR_CODES) {
      const copy = pubchiErrorCopy(code);

      expect(copy.message).toBeTruthy();
      expect(copy.message).not.toContain(code);
    }
    expect(PUBCHI_ERROR_CODES).toEqual(expect.arrayContaining([...ERROR_CODES]));
    expect(Object.keys(PUBCHI_ERROR_COPY_BY_CODE)).toEqual(expect.arrayContaining([...PUBCHI_ERROR_CODES]));
  });

  it('does not expose a support code for recognised service errors', () => {
    expect(pubchiErrorCopy('BUDGET_EXCEEDED')).toEqual({
      message: "Your Pubchi has used today's budget. It resets at midnight UTC.",
    });
  });

  it.each(['NEW_SERVICE_CODE', 'Failed to fetch https://private.example', 'private backend detail'])(
    'does not display unknown text: %s',
    (code) => {
      expect(pubchiErrorCopy(code)).toEqual({ message: 'Something went wrong on the Pubchi service.' });
    },
  );

  it('uses a separate message for network failures', () => {
    expect(pubchiErrorCopy('CONNECTION_FAILED').message).toBe(
      "I couldn't reach the Pubchi service. Check your connection and try again in a minute.",
    );
  });

  it('does not fall back to the generic service error for BRAIN_FORBIDDEN', () => {
    expect(pubchiErrorCopy('BRAIN_FORBIDDEN')).toEqual({
      message:
        "This Pubchi's brain isn't allowed here. A self-hosted brain has to run on this machine (127.0.0.1, localhost, or ::1).",
    });
    expect(pubchiErrorCopy('BRAIN_FORBIDDEN').message).not.toBe('Something went wrong on the Pubchi service.');
  });

  it('keeps BRAIN_UNAVAILABLE distinct from the graph UPSTREAM_UNAVAILABLE sentence', () => {
    expect(pubchiErrorCopy('BRAIN_UNAVAILABLE')).toEqual({
      message: "The brain didn't answer. If you run a local model, check that it is up and try again in a minute.",
    });
    expect(pubchiErrorCopy('BRAIN_UNAVAILABLE').message).not.toBe(pubchiErrorCopy('UPSTREAM_UNAVAILABLE').message);
  });
});

describe('pubchiQueryErrorCode', () => {
  it.each(Object.values(NetworkErrorCode))('maps network code %s without relying on its message', (code) => {
    const error = new AppError({
      category: ErrorCategory.Network,
      code,
      message: 'private browser detail',
      service: ErrorService.Pubchi,
      operation: 'query',
    });
    expect(pubchiQueryErrorCode(error)).toBe('CONNECTION_FAILED');
  });

  it.each(Object.values(TimeoutErrorCode))('maps timeout code %s to retry guidance', (code) => {
    const error = new AppError({
      category: ErrorCategory.Timeout,
      code,
      message: 'Request was aborted',
      service: ErrorService.Pubchi,
      operation: 'query',
    });
    expect(pubchiQueryErrorCode(error)).toBe('REQUEST_TIMEOUT');
  });

  it('uses only closed protocol metadata and never classifies an arbitrary message as a protocol code', () => {
    const error = new AppError({
      category: ErrorCategory.Validation,
      code: ValidationErrorCode.INVALID_INPUT,
      message: 'UNAUTHORIZED',
      service: ErrorService.Pubchi,
      operation: 'query',
      context: { pubchiCode: 'unknown backend detail' },
    });
    expect(pubchiQueryErrorCode(error)).toBe('SCHEMA_INVALID');
  });

  it('keeps unknown structured failures generic', () => {
    const error = new AppError({
      category: ErrorCategory.Server,
      code: ServerErrorCode.UNKNOWN_ERROR,
      message: 'private backend detail',
      service: ErrorService.Pubchi,
      operation: 'query',
    });
    expect(pubchiQueryErrorCode(error)).toBe('SCHEMA_INVALID');
    expect(pubchiQueryErrorCode(new Error('private browser detail'))).toBe('SCHEMA_INVALID');
  });
});
