import { describe, expect, it } from 'vitest';
import { ServerErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { HttpStatusCode } from '@/libs/http/http.types';
import { getStorageQuotaToastMessage, STORAGE_QUOTA_REACHED_MESSAGE } from './storageQuota';

const insufficientStorageError = () =>
  Err.server(ServerErrorCode.UNKNOWN_ERROR, 'Insufficient Storage', {
    service: ErrorService.Homeserver,
    operation: 'commitCreate',
    context: { statusCode: HttpStatusCode.INSUFFICIENT_STORAGE },
  });

describe('getStorageQuotaToastMessage', () => {
  it('maps a 507 Insufficient Storage error to the quota message', () => {
    expect(getStorageQuotaToastMessage(insufficientStorageError())).toBe(STORAGE_QUOTA_REACHED_MESSAGE);
  });

  it('ignores other HTTP statuses', () => {
    const notFound = Err.server(ServerErrorCode.UNKNOWN_ERROR, 'Not found', {
      service: ErrorService.Homeserver,
      operation: 'commitCreate',
      context: { statusCode: HttpStatusCode.NOT_FOUND },
    });

    expect(getStorageQuotaToastMessage(notFound)).toBeNull();
  });

  it('ignores plain errors', () => {
    expect(getStorageQuotaToastMessage(new Error('Failed to create post'))).toBeNull();
    expect(getStorageQuotaToastMessage(undefined)).toBeNull();
  });
});
