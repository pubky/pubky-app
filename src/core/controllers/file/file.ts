import * as Core from '@/core';

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
  static async commitCreate({ file, pubky }: Core.TUploadFileParams): Promise<string> {
    // 1. Normalize File Attachment
    const fileAttachment = await Core.FileNormalizer.toFileAttachment({ file, pubky });
    // 2. Upload to homeserver
    await Core.FileApplication.commitCreate({ fileAttachments: [fileAttachment] });
    return fileAttachment.fileResult.meta.url;
  }

  /**
   * Gets the CDN URL for a user's avatar.
   *
   * @param pubky - User's public key
   * @param version - Optional version string/number for cache busting
   * @returns CDN URL string for the avatar
   */
  static getAvatarUrl(pubky: Core.Pubky, version?: string | number): string {
    return Core.FileApplication.getAvatarUrl(pubky, version);
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
  static getFileUrl({ fileId, variant }: Core.TGetFileUrlParams): string {
    return Core.FileApplication.getFileUrl({ fileId, variant });
  }

  /**
   * Gets files metadata
   *
   * @param params - Parameters for reading files
   * @param params.fileUris - Array of file URIs (pubky) to fetch
   * @returns Promise resolving to file metadata
   */
  static async getMetadata({ fileAttachments }: Core.TGetMetadataParams) {
    return await Core.FileApplication.getMetadata({ fileAttachments });
  }

  /**
   * Fetches missing file metadata from nexus and persists it locally.
   *
   * @param params - Parameters for fetching files
   * @param params.fileUris - Array of file URIs to fetch and persist
   */
  static async fetchFiles({ fileUris }: Core.TFetchFilesParams) {
    return await Core.FileApplication.fetchFiles(fileUris);
  }
}
