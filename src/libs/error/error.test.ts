import { describe, it, expect } from 'vitest';
import { AppError } from '@/libs/error/error';
import { DatabaseErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorCategory, ErrorService } from '@/libs/error/error.types';

describe('Error Library', () => {
  describe('AppError (Category-based)', () => {
    it('should create an error with correct properties', () => {
      const error = Err.database(DatabaseErrorCode.QUERY_FAILED, 'Failed to read post', {
        service: ErrorService.Local,
        operation: 'readDetails',
        context: { table: 'postDetails', postId: '123' },
      });

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(AppError);
      expect(error.name).toBe('AppError');
      expect(error.category).toBe(ErrorCategory.Database);
      expect(error.code).toBe(DatabaseErrorCode.QUERY_FAILED);
      expect(error.message).toBe('Failed to read post');
      expect(error.service).toBe(ErrorService.Local);
      expect(error.operation).toBe('readDetails');
      expect(error.context).toEqual({ table: 'postDetails', postId: '123' });
    });

    it('should preserve cause for debugging', () => {
      const originalError = new Error('Original error');
      const error = Err.database(DatabaseErrorCode.WRITE_FAILED, 'Write failed', {
        service: ErrorService.Local,
        operation: 'create',
        cause: originalError,
      });

      expect(error.cause).toBe(originalError);
    });

    describe('setTraceId', () => {
      it('should set traceId after construction', () => {
        const error = Err.database(DatabaseErrorCode.QUERY_FAILED, 'Query failed', {
          service: ErrorService.Local,
          operation: 'read',
        });

        expect(error.traceId).toBeUndefined();

        error.setTraceId('trace-123');

        expect(error.traceId).toBe('trace-123');
      });

      it('should return this for chaining', () => {
        const error = Err.database(DatabaseErrorCode.QUERY_FAILED, 'Query failed', {
          service: ErrorService.Local,
          operation: 'read',
        });

        const result = error.setTraceId('trace-456');

        expect(result).toBe(error);
        expect(result.traceId).toBe('trace-456');
      });

      it('should allow inline enrichment pattern', () => {
        const traceId = 'inline-trace-789';
        const error = Err.database(DatabaseErrorCode.QUERY_FAILED, 'Query failed', {
          service: ErrorService.Local,
          operation: 'read',
        }).setTraceId(traceId);

        expect(error.traceId).toBe(traceId);
        expect(error.category).toBe(ErrorCategory.Database);
      });

      it('should preserve stack trace when enriching', () => {
        const error = Err.database(DatabaseErrorCode.QUERY_FAILED, 'Query failed', {
          service: ErrorService.Local,
          operation: 'read',
        });
        const originalStack = error.stack;

        error.setTraceId('trace-preserve-stack');

        expect(error.stack).toBe(originalStack);
      });

      it('should allow overwriting traceId', () => {
        const error = Err.database(DatabaseErrorCode.QUERY_FAILED, 'Query failed', {
          service: ErrorService.Local,
          operation: 'read',
          traceId: 'initial-trace',
        });

        expect(error.traceId).toBe('initial-trace');

        error.setTraceId('updated-trace');

        expect(error.traceId).toBe('updated-trace');
      });
    });
  });
});
