import { buildFile, limits } from 'pubky-social-specs';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import type { TFileAttachmentResult, TFileAttachmentWithDataParams } from '@/pipes/file/file.types';

export class FileNormalizer {
  private constructor() {}

  static toFileAttachment({ file, mediaId, blobData, pubky }: TFileAttachmentWithDataParams): TFileAttachmentResult {
    // With an id the builder never sees the bytes, so the size cap is checked here.
    if (blobData.length === 0 || blobData.length > limits.maxFileSizeBytes) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'File is empty or over the size limit', {
        service: ErrorService.PubkyAppSpecs,
        operation: 'toFileAttachment',
        context: { size: blobData.length, pubky },
      });
    }
    try {
      const media = buildFile(pubky, { id: mediaId, type: file.type });
      return { media, bytes: blobData, name: file.name, contentType: file.type };
    } catch (error) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, error instanceof Error ? error.message : String(error), {
        service: ErrorService.PubkyAppSpecs,
        operation: 'buildFile',
        context: { name: file.name, type: file.type, pubky },
        cause: error,
      });
    }
  }
}
