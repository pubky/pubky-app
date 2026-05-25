import { BlobResult, FileResult } from 'pubky-app-specs';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import type {
  TCreateBlobParams,
  TFileAttachmentResult,
  TFileAttachmentWithDataParams,
  TToFileParams,
} from '@/pipes/file/file.types';
import { PubkySpecsSingleton } from '@/pipes/pipes.builder';

export class FileNormalizer {
  private constructor() {}

  static toFileAttachment({ file, blobData, pubky }: TFileAttachmentWithDataParams): TFileAttachmentResult {
    try {
      const blobResult = this.toBlob({ blobData, pubky });
      const fileResult = this.toFile({ file, url: blobResult.meta.url, pubky });
      return { blobResult, fileResult };
    } catch (error) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, error as string, {
        service: ErrorService.PubkyAppSpecs,
        operation: 'toFileAttachment',
        context: { file, pubky },
      });
    }
  }

  private static toBlob({ blobData, pubky }: TCreateBlobParams): BlobResult {
    try {
      const builder = PubkySpecsSingleton.get(pubky);
      return builder.createBlob(blobData);
    } catch (error) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, error as string, {
        service: ErrorService.PubkyAppSpecs,
        operation: 'createBlob',
        context: { pubky },
      });
    }
  }

  private static toFile({ file, url, pubky }: TToFileParams): FileResult {
    try {
      const builder = PubkySpecsSingleton.get(pubky);
      return builder.createFile(file.name, url, file.type, file.size);
    } catch (error) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, error as string, {
        service: ErrorService.PubkyAppSpecs,
        operation: 'createFile',
        context: { file, url, pubky },
      });
    }
  }
}
