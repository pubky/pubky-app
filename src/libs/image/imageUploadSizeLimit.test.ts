import { describe, expect, it } from 'vitest';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import {
  getImageUploadSizeLimitKind,
  getImageUploadSizeLimitLabelMb,
  getImageUploadSizeLimitToastMessage,
  IMAGE_UPLOAD_SIZE_LIMIT_KIND_CONTEXT_KEY,
  throwImageUploadSizeLimit,
} from './imageUploadSizeLimit';

describe('imageUploadSizeLimit', () => {
  it('throws a tagged plain Error for each kind', () => {
    expect(() => throwImageUploadSizeLimit('gif')).toThrow('IMAGE_UPLOAD_SIZE_LIMIT:gif');
  });

  it('reads the kind from a tagged Error message', () => {
    expect(getImageUploadSizeLimitKind(new Error('IMAGE_UPLOAD_SIZE_LIMIT:svg'))).toBe('svg');
  });

  it('reads the kind from AppError context', () => {
    const error = Err.validation(ValidationErrorCode.INVALID_INPUT, 'Image sanitization failed', {
      service: ErrorService.Local,
      operation: 'toFileAttachment',
      context: { [IMAGE_UPLOAD_SIZE_LIMIT_KIND_CONTEXT_KEY]: 'animated-webp' },
    });

    expect(getImageUploadSizeLimitKind(error)).toBe('animated-webp');
  });

  it('walks AppError.cause for a tagged nested Error', () => {
    const error = Err.validation(ValidationErrorCode.INVALID_INPUT, 'Failed to upload collection cover image', {
      service: ErrorService.Local,
      operation: 'commitEditCollection',
      cause: Err.validation(ValidationErrorCode.INVALID_INPUT, 'Image sanitization failed', {
        service: ErrorService.Local,
        operation: 'toFileAttachment',
        cause: new Error('IMAGE_UPLOAD_SIZE_LIMIT:gif'),
        context: { [IMAGE_UPLOAD_SIZE_LIMIT_KIND_CONTEXT_KEY]: 'gif' },
      }),
    });

    expect(getImageUploadSizeLimitKind(error)).toBe('gif');
  });

  it('returns null for unrelated errors', () => {
    expect(getImageUploadSizeLimitKind(new Error('boom'))).toBeNull();
    expect(getImageUploadSizeLimitKind(null)).toBeNull();
  });

  it('formats the max-size label from config', () => {
    expect(getImageUploadSizeLimitLabelMb('raw')).toBe('20MB');
    expect(getImageUploadSizeLimitLabelMb('gif')).toBe('5MB');
  });

  it('resolves a localized toast message from a size-limit error', () => {
    const tFile = (key: string, values: { maxSize: string }) => `${key}:${values.maxSize}`;
    const message = getImageUploadSizeLimitToastMessage(new Error('IMAGE_UPLOAD_SIZE_LIMIT:gif'), tFile);

    expect(message).toBe('imageTooLargeGif:5MB');
  });
});
