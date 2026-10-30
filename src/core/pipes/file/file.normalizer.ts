import { buildFile, limits } from 'pubky-social-specs';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import type { TFileAttachmentResult, TFileAttachmentWithDataParams } from '@/pipes/file/file.types';
import { toSpecsValidationError } from '@/pipes/specs.errors';

export class FileNormalizer {
  private constructor() {}

  /**
   * Where the media goes: `files/{hash}.{ext}` under the author's public tree, the hash being the
   * id `hashMedia` computed from the bytes and the extension picked by the declared type. The
   * bytes themselves are the body to PUT; nothing else is stored for a file.
   */
  static toFileAttachment({ file, mediaId, blobData, pubky }: TFileAttachmentWithDataParams): TFileAttachmentResult {
    // With an id the builder never sees the bytes, so the size cap is checked here.
    if (blobData.length === 0 || blobData.length > limits.maxFileSizeBytes) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'File is empty or over the size limit', {
        service: ErrorService.SocialSpecs,
        operation: 'toFileAttachment',
        context: { size: blobData.length, limit: limits.maxFileSizeBytes, pubky },
      });
    }
    try {
      const media = buildFile(pubky, { id: mediaId, type: file.type });
      return { media, bytes: blobData, name: file.name, contentType: file.type };
    } catch (error) {
      throw toSpecsValidationError(error, 'buildFile', { name: file.name, type: file.type, pubky });
    }
  }
}
