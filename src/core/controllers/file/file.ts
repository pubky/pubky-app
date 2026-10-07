import { FileApplication } from '@/application/file/file';
import type {
  TDeleteFilesParams,
  TFetchFilesParams,
  TGetFileUrlParams,
  TGetMetadataParams,
  TUploadFileParams,
} from '@/controllers/file/file.types';
import type { Pubky } from '@/models/models.types';

/**
 * File Controller
 *
 * Handles file operations including upload, read, and URL generation.
 * Delegates to application layer for business logic orchestration.
 */
export class FileController {
  private constructor() {} // Prevent instantiation

  /**
   * Uploads a file to the homeserver.
   * Normalizes the file and blob, then uploads both to the homeserver.
   *
   * @param params - Parameters for file upload
   * @param params.file - The file to upload
   * @param params.pubky - User's public key
   * @returns Promise resolving to the file URL
   */
  static async commitCreate({ file, pubky }: TUploadFileParams): Promise<string> {
    // 1. Normalize File Attachment
    const fileAttachment = await FileApplication.toFileAttachment({ file, pubky });
    // 2. Upload to homeserver
    await FileApplication.commitCreate({ fileAttachments: [fileAttachment] });
    return fileAttachment.fileResult.meta.url;
  }

  /**
   * Deletes files (blob first, then record) from the homeserver and the local
   * cache. Shared blobs and already-deleted resources are handled by the
   * application layer, so callers may treat this as idempotent best-effort
   * cleanup (e.g. discarding uploads of an unpublished article draft).
   *
   * @param params - Parameters for file deletion
   * @param params.fileUris - Homeserver file URIs (`pubky://…/files/{id}`) to delete
   */
  static async commitDelete({ fileUris }: TDeleteFilesParams): Promise<void> {
    await FileApplication.commitDelete(fileUris);
  }

  /**
   * Gets the CDN URL for a user's avatar.
   *
   * @param pubky - User's public key
   * @param version - Optional version string/number for cache busting
   * @returns CDN URL string for the avatar
   */
  static getAvatarUrl(pubky: Pubky, version?: string | number): string {
    return FileApplication.getAvatarUrl(pubky, version);
  }

  /**
   * Gets the CDN URL for a file with a specific variant.
   *
   * @param params - Parameters for file URL
   * @param params.pubky - User's public key
   * @param params.fileId - File identifier
   * @param params.variant - File variant (small, feed, main)
   * @returns CDN URL string
   */
  static getFileUrl({ fileId, variant }: TGetFileUrlParams): string {
    return FileApplication.getFileUrl({ fileId, variant });
  }

  /**
   * Gets files metadata
   *
   * @param params - Parameters for reading files
   * @param params.fileUris - Array of file URIs (pubky) to fetch
   * @returns Promise resolving to file metadata
   */
  static async getMetadata({ fileAttachments }: TGetMetadataParams) {
    return await FileApplication.getMetadata({ fileAttachments });
  }

  /**
   * Fetches missing file metadata from nexus and persists it locally.
   *
   * @param params - Parameters for fetching files
   * @param params.fileUris - Array of file URIs to fetch and persist
   */
  static async fetchFiles({ fileUris }: TFetchFilesParams) {
    return await FileApplication.fetchFiles(fileUris);
  }
}
