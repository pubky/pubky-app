import { hashMedia, parseUri } from 'pubky-social-specs';
import type { FilesListParams } from '@/application/file/file.types';
import type { TGetFileUrlParams, TGetMetadataParams, TUploadFileParams } from '@/controllers/file/file.types';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
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
    let mediaId: string;
    try {
      // Hashed a chunk at a time so a large file does not freeze the page.
      [blobData, mediaId] = await Promise.all([
        sanitizedFile.arrayBuffer().then((buffer) => new Uint8Array(buffer)),
        hashMedia(sanitizedFile),
      ]);
    } catch (error) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Failed to read file content', {
        service: ErrorService.Local,
        operation: 'toFileAttachment',
        cause: error,
      });
    }
    return FileNormalizer.toFileAttachment({ file: sanitizedFile, mediaId, blobData, pubky });
  }

  /**
   * Uploads media to the homeserver and persists its metadata locally. v1 media is one
   * content-addressed file: there is no metadata record to write.
   */
  static async commitCreate({ fileAttachments }: FilesListParams) {
    // allSettled, not all: on a partial failure the callers roll back the whole
    // batch (`commitDeleteUploaded`) — rejecting early would start that sweep
    // while sibling uploads are still in flight, letting a late PUT recreate a
    // file the sweep already deleted, or finish after it and orphan.
    // Waiting for every upload to settle before throwing keeps rollback safe.
    const results = await Promise.allSettled(
      fileAttachments.map(async (fileAttachment) => {
        await HomeserverService.putBlob({ url: fileAttachment.media.url, blob: fileAttachment.bytes });
        await LocalFileService.create(fileAttachment);
      }),
    );

    const firstFailure = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
    if (firstFailure) {
      throw firstFailure.reason;
    }
  }

  /**
   * Deletes media the caller no longer references. Media is content addressed, so byte-identical
   * uploads share one file: a URI another cached post of the author still references is kept.
   * That check is local-only knowledge (posts never cached on this device are not seen). A 0.x
   * file URI (`/pub/pubky.app/files/`) is left alone: its blob is named by the 0.x File object,
   * which this client no longer reads.
   *
   * @param fileAttachments - The media URIs to delete
   * @param excludePostId - The post giving them up, whose own references do not count
   */
  static async commitDelete(fileAttachments: string[], excludePostId?: string) {
    await Promise.all(
      fileAttachments.map(async (fileUri) => {
        const fileCompositeId = buildCompositeIdFromPubkyUri({ uri: fileUri, domain: CompositeIdDomain.FILES });
        if (!fileCompositeId || !isV1MediaUri(fileUri)) return;

        if (await LocalFileService.isReferencedElsewhere({ uri: fileUri, excludePostId })) {
          Logger.debug('[FileApplication] Skipping deletion of shared media', { fileUri });
          return;
        }
        await HomeserverService.deleteIdempotent(fileUri);
        await LocalFileService.deleteById(fileCompositeId);
      }),
    );
  }

  /**
   * Deletes freshly uploaded media during a rollback. Identical bytes already on the homeserver
   * share the URI, so the same reference check as `commitDelete` applies.
   */
  static async commitDeleteUploaded(fileAttachments: TFileAttachmentResult[]) {
    await this.commitDelete(fileAttachments.map((attachment) => attachment.media.url));
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

    const filesWithCompositeIds = fileAttachments.flatMap((file) => {
      const compositeId = buildCompositeIdFromPubkyUri({
        uri: file?.uri,
        domain: CompositeIdDomain.FILES,
      });
      // A malformed remote record must not prevent valid peers from refreshing.
      if (!compositeId) {
        Logger.warn('Ignoring file metadata with an invalid URI');
        return [];
      }
      let urls: NexusFileUrls;
      try {
        urls = typeof file.urls === 'string' ? (JSON.parse(file.urls) as NexusFileUrls) : file.urls;
      } catch {
        Logger.warn('Ignoring file metadata with malformed URL JSON', { fileId: compositeId });
        return [];
      }
      return [
        {
          ...file,
          urls,
          id: compositeId,
        },
      ];
    });

    if (filesWithCompositeIds.length) await LocalFileService.createMany({ files: filesWithCompositeIds });
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

function isV1MediaUri(uri: string): boolean {
  try {
    return parseUri(uri).kind === 'file';
  } catch {
    return false;
  }
}
