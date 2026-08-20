import type { FilesListParams } from '@/application/file/file.types';
import type { TGetFileUrlParams, TGetMetadataParams, TUploadFileParams } from '@/controllers/file/file.types';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { hasHttpStatus } from '@/libs/error/error.utils';
import { HttpMethod, HttpStatusCode } from '@/libs/http/http.types';
import {
  getImageUploadSizeLimitKind,
  IMAGE_UPLOAD_SIZE_LIMIT_KIND_CONTEXT_KEY,
} from '@/libs/image/imageUploadSizeLimit';
import { stripImageMetadata } from '@/libs/image/stripImageMetadata';
import { Logger } from '@/libs/logger/logger';
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
      // Tag size-limit failures so UI can show the kind-specific toast (GIF/animated
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
    // allSettled, not all: on a partial failure the callers roll back the whole
    // batch (`commitDeleteUploaded`) — rejecting early would start that sweep
    // while sibling uploads are still in flight, letting a late PUT recreate a
    // record/blob the sweep already deleted, or finish after it and orphan.
    // Waiting for every upload to settle before throwing keeps rollback safe.
    const results = await Promise.allSettled(
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

    const firstFailure = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
    if (firstFailure) {
      throw firstFailure.reason;
    }
  }

  /**
   * Deletes a blob unless a cached file record outside the batch being deleted
   * still references it — blob ids are content hashes, so byte-identical
   * uploads share one blob (e.g. removing an attachment while an identical one
   * is kept, or exists on another post). The check is local-only knowledge;
   * uncached sibling records are not seen (homeserver-side ref-counting is the
   * complete fix, tracked as a follow-up).
   */
  private static async deleteBlobUnlessShared({
    blobSrc,
    excludeFileIds,
  }: {
    blobSrc: string;
    excludeFileIds: Set<string>;
  }) {
    const shared = await LocalFileService.hasOtherBlobReference({ blobSrc, excludeFileIds });
    if (shared) {
      Logger.debug('[FileApplication] Skipping deletion of shared blob', { blobSrc });
      return;
    }
    await HomeserverService.deleteIdempotent(blobSrc);
  }

  /**
   * Commit the delete file operation, this will delete the file from the local database and sync to the homeserver.
   *
   * Per file: the blob src is resolved (local row, or homeserver GET as
   * fallback), the blob is deleted FIRST, then the record — if the blob delete
   * fails the record still points at it, so a retry can find it again
   * (record-first would orphan the blob on partial failure). Shared blobs
   * (referenced by cached records outside this batch) are skipped, and all
   * homeserver deletes are idempotent (404 = already gone = success) with
   * transient-failure retry.
   *
   * @param fileAttachments - The file attachment URIs to delete
   */
  static async commitDelete(fileAttachments: string[]) {
    const batchFileIds = new Set(
      fileAttachments
        .map((uri) => buildCompositeIdFromPubkyUri({ uri, domain: CompositeIdDomain.FILES }))
        .filter((id): id is string => id !== null),
    );

    await Promise.all(
      fileAttachments.map(async (fileUri) => {
        const fileCompositeId = buildCompositeIdFromPubkyUri({
          uri: fileUri,
          domain: CompositeIdDomain.FILES,
        });

        if (!fileCompositeId) {
          // Can't resolve the blob without a composite id; delete the record only
          await HomeserverService.deleteIdempotent(fileUri);
          return;
        }

        const localFile = await LocalFileService.read(fileCompositeId);
        let blobSrc = localFile?.src;
        if (!blobSrc) {
          try {
            const remoteFile = (await HomeserverService.request({ method: HttpMethod.GET, url: fileUri })) as {
              src: string;
            };
            blobSrc = remoteFile.src;
          } catch (error) {
            // Record already gone with no local row: the blob is unknowable and
            // there is nothing left to clean up — the end state is reached
            if (hasHttpStatus(error, HttpStatusCode.NOT_FOUND)) {
              return;
            }
            throw error;
          }
        }

        // Delete the file blob (unless shared), then the file metadata
        await this.deleteBlobUnlessShared({ blobSrc, excludeFileIds: batchFileIds });
        await HomeserverService.deleteIdempotent(fileUri);
        if (localFile) {
          await LocalFileService.deleteById(fileCompositeId);
        }
      }),
    );
  }

  /**
   * Deletes freshly uploaded attachments during a rollback, using their known
   * record and blob URLs from the normalized results. Unlike `commitDelete`,
   * this never needs the record to discover the blob — so it also cleans up
   * when the record PUT itself failed (blob uploaded, record missing), which
   * `commitDelete`'s record-GET fallback cannot reach.
   */
  static async commitDeleteUploaded(fileAttachments: TFileAttachmentResult[]) {
    const batchFileIds = new Set(
      fileAttachments
        .map((attachment) =>
          buildCompositeIdFromPubkyUri({ uri: attachment.fileResult.meta.url, domain: CompositeIdDomain.FILES }),
        )
        .filter((id): id is string => id !== null),
    );

    await Promise.all(
      fileAttachments.map(async ({ blobResult, fileResult }) => {
        await this.deleteBlobUnlessShared({ blobSrc: blobResult.meta.url, excludeFileIds: batchFileIds });
        await HomeserverService.deleteIdempotent(fileResult.meta.url);

        const fileCompositeId = buildCompositeIdFromPubkyUri({
          uri: fileResult.meta.url,
          domain: CompositeIdDomain.FILES,
        });
        if (fileCompositeId) {
          await LocalFileService.deleteById(fileCompositeId);
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
