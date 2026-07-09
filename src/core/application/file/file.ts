import type { FilesListParams } from '@/application/file/file.types';
import type { TGetFileUrlParams, TGetMetadataParams, TUploadFileParams } from '@/controllers/file/file.types';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { HttpMethod } from '@/libs/http/http.types';
import {
  getImageUploadSizeLimitKind,
  IMAGE_UPLOAD_SIZE_LIMIT_KIND_CONTEXT_KEY,
} from '@/libs/image/imageUploadSizeLimit';
import { stripImageMetadata } from '@/libs/image/stripImageMetadata';
import { CompositeIdDomain, type Pubky } from '@/models/models.types';
import { buildCompositeIdFromPubkyUri, parseCompositeId } from '@/models/models.utils';
import { FileNormalizer } from '@/pipes/file/file.normalizer';
import type { TFileAttachmentResult } from '@/pipes/file/file.types';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { LocalFileService } from '@/services/local/file/file';
import { NexusFileService } from '@/services/nexus/file/file';
import { filesApi } from '@/services/nexus/file/file.api';
import type { NexusFileDetails, NexusFileUrls } from '@/services/nexus/nexus.types';

/**
 * File Application
 *
 * Orchestrates file operations including upload and read workflows.
 * Coordinates between homeserver (writes) and nexus (reads) services.
 */
export class FileApplication {
  private constructor() {} // Prevent instantiation

  static async toFileAttachment({ file, pubky }: TUploadFileParams): Promise<TFileAttachmentResult> {
    let sanitizedFile: File;
    try {
      sanitizedFile = await stripImageMetadata(file);
    } catch (error) {
      // Tag size-limit failures so UI can show a localized toast (GIF/animated
      // WebP/SVG cannot be compressed under the homeserver cap).
      const sizeLimitKind = getImageUploadSizeLimitKind(error);
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Image sanitization failed', {
        service: ErrorService.Local,
        operation: 'toFileAttachment',
        cause: error,
        context: sizeLimitKind ? { [IMAGE_UPLOAD_SIZE_LIMIT_KIND_CONTEXT_KEY]: sizeLimitKind } : undefined,
      });
    }
    let blobData: Uint8Array;
    try {
      blobData = new Uint8Array(await sanitizedFile.arrayBuffer());
    } catch (error) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Failed to read file content', {
        service: ErrorService.Local,
        operation: 'toFileAttachment',
        cause: error,
      });
    }
    return FileNormalizer.toFileAttachment({ file: sanitizedFile, blobData, pubky });
  }

  /**
   * Uploads a file to the homeserver and persists it locally and persist it locally.
   * First uploads the blob data, then creates the file record.
   *
   * @param params - Parameters for file upload
   * @param params.blobResult - Normalized blob result
   * @param params.fileResult - Normalized file result
   */
  static async commitCreate({ fileAttachments }: FilesListParams) {
    await Promise.all(
      fileAttachments.map(async (fileAttachment) => {
        const { blobResult, fileResult } = fileAttachment;
        // Upload Blob
        await HomeserverService.putBlob({ url: blobResult.meta.url, blob: blobResult.blob.data });
        // Create File Record
        await HomeserverService.request({
          method: HttpMethod.PUT,
          url: fileResult.meta.url,
          bodyJson: fileResult.file.toJson(),
        });
        // Persist Files locally
        await LocalFileService.create({ blobResult, fileResult });
      }),
    );
  }

  /**
   * Commit the delete file operation, this will delete the file from the local database and sync to the homeserver.
   * @param fileAttachments - The file attachments to delete
   */
  static async commitDelete(fileAttachments: string[]) {
    await Promise.all(
      fileAttachments.map(async (fileUri) => {
        // Delete the file metadata
        await HomeserverService.delete(fileUri);
        const fileCompositeId = buildCompositeIdFromPubkyUri({
          uri: fileUri,
          domain: CompositeIdDomain.FILES,
        });
        if (fileCompositeId) {
          const file = await LocalFileService.read(fileCompositeId);
          if (file) {
            // Delete the file blob
            await HomeserverService.delete(file.src);
            await LocalFileService.deleteById(fileCompositeId);
          } else {
            const file = (await HomeserverService.request({ method: HttpMethod.GET, url: fileUri })) as {
              src: string;
            };
            // Delete the file blob
            await HomeserverService.delete(file.src);
          }
        }
      }),
    );
  }

  /**
   * Gets the metadata for a list of file attachments.
   * @param fileAttachments - The file attachments to get the metadata for
   * @returns The metadata for the file attachments
   */
  static async getMetadata({ fileAttachments }: TGetMetadataParams) {
    const compositeFileIds = fileAttachments.flatMap((uri) => {
      const compositeId = buildCompositeIdFromPubkyUri({ uri, domain: CompositeIdDomain.FILES });
      return compositeId ? [compositeId] : [];
    });
    const files = await LocalFileService.findByIds(compositeFileIds);
    return files;
  }

  /**
   * Gets the avatar URL for a user.
   * @param pubky - The user's public key
   * @param version - Optional version string/number for cache busting
   * @returns The avatar URL
   */
  static getAvatarUrl(pubky: Pubky, version?: string | number): string {
    return filesApi.getAvatarUrl(pubky, version);
  }

  /**
   * Gets the file URL for a file.
   * @param fileId - The file ID
   * @param variant - The variant of the file
   * @returns The file URL
   */
  static getFileUrl({ fileId, variant }: TGetFileUrlParams): string {
    const { pubky, id } = parseCompositeId(fileId);
    return filesApi.getFileUrl({ pubky, file_id: id, variant });
  }

  /**
   * Transforms and persists file metadata to the local database.
   * Builds composite IDs from URIs, parses URL fields, and saves them locally.
   *
   * @param fileAttachments - Array of file metadata objects already available (no HTTP fetch needed)
   */
  static async persistFiles(fileAttachments: NexusFileDetails[]) {
    if (fileAttachments.length === 0) {
      return;
    }

    const filesWithCompositeIds = fileAttachments.map((file) => {
      const compositeId = buildCompositeIdFromPubkyUri({
        uri: file.uri,
        domain: CompositeIdDomain.FILES,
      });
      return {
        ...file,
        urls: typeof file.urls === 'string' ? (JSON.parse(file.urls) as NexusFileUrls) : file.urls,
        id: compositeId,
      };
    });

    await LocalFileService.createMany({ files: filesWithCompositeIds as NexusFileDetails[] });
  }

  /**
   * Fetches file metadata from nexus by URIs and persists them locally.
   * Used by bootstrap where file metadata is not available inline.
   *
   * @param fileUris - Array of file URIs to fetch and persist
   */
  static async fetchFiles(fileUris: string[]) {
    if (fileUris.length === 0) {
      return;
    }

    const nexusFiles = await NexusFileService.fetchFiles(fileUris);
    await this.persistFiles(nexusFiles);
  }
}
