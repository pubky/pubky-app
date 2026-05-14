import { BlobResult, FileResult } from 'pubky-app-specs';
import type { TToFileParams, TUploadFileParams } from '@/controllers/file/file.types';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import type { TFileAttachmentResult } from '@/pipes/file/file.types';
import { PubkySpecsSingleton } from '@/pipes/pipes.builder';

export class FileNormalizer {
  private constructor() {}

  static async toFileAttachment({ file, pubky }: TUploadFileParams): Promise<TFileAttachmentResult> {
    try {
      const blobResult = await this.toBlob({ file, pubky });
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

  private static async toBlob({ file, pubky }: TUploadFileParams): Promise<BlobResult> {
    try {
      const fileContent = await file.arrayBuffer();
      const blobData = new Uint8Array(fileContent);

      const builder = PubkySpecsSingleton.get(pubky);
      return builder.createBlob(blobData);
    } catch (error) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, error as string, {
        service: ErrorService.PubkyAppSpecs,
        operation: 'createBlob',
        context: { file, pubky },
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
