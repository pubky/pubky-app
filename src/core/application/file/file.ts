import * as Core from '@/core';
import { HttpMethod } from '@/libs/http/http.types';

/**
 * File Application
 *
 * Orchestrates file operations including upload and read workflows.
 * Coordinates between homeserver (writes) and nexus (reads) services.
 */
export class FileApplication {
  private constructor() {} // Prevent instantiation

  /**
   * Uploads a file to the homeserver and persists it locally and persist it locally.
   * First uploads the blob data, then creates the file record.
   *
   * @param params - Parameters for file upload
   * @param params.blobResult - Normalized blob result
   * @param params.fileResult - Normalized file result
   */
  static async commitCreate({ fileAttachments }: Core.FilesListParams) {
    await Promise.all(
      fileAttachments.map(async (fileAttachment) => {
        const { blobResult, fileResult } = fileAttachment;
        // Upload Blob
        await Core.HomeserverService.putBlob({ url: blobResult.meta.url, blob: blobResult.blob.data });
        // Create File Record
        await Core.HomeserverService.request({
          method: HttpMethod.PUT,
          url: fileResult.meta.url,
          bodyJson: fileResult.file.toJson(),
        });
        // Persist Files locally
        await Core.LocalFileService.create({ blobResult, fileResult });
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
        await Core.HomeserverService.delete(fileUri);
        const fileCompositeId = Core.buildCompositeIdFromPubkyUri({
          uri: fileUri,
          domain: Core.CompositeIdDomain.FILES,
        });
        if (fileCompositeId) {
          const file = await Core.LocalFileService.read(fileCompositeId);
          if (file) {
            // Delete the file blob
            await Core.HomeserverService.delete(file.src);
            await Core.LocalFileService.deleteById(fileCompositeId);
          } else {
            const file = (await Core.HomeserverService.request({ method: HttpMethod.GET, url: fileUri })) as {
              src: string;
            };
            // Delete the file blob
            await Core.HomeserverService.delete(file.src);
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
  static async getMetadata({ fileAttachments }: Core.TGetMetadataParams) {
    const compositeFileIds = fileAttachments.flatMap((uri) => {
      const compositeId = Core.buildCompositeIdFromPubkyUri({ uri, domain: Core.CompositeIdDomain.FILES });
      return compositeId ? [compositeId] : [];
    });
    const files = await Core.LocalFileService.findByIds(compositeFileIds);
    return files;
  }

  /**
   * Gets the avatar URL for a user.
   * @param pubky - The user's public key
   * @param version - Optional version string/number for cache busting
   * @returns The avatar URL
   */
  static getAvatarUrl(pubky: Core.Pubky, version?: string | number): string {
    return Core.filesApi.getAvatarUrl(pubky, version);
  }

  /**
   * Gets the file URL for a file.
   * @param fileId - The file ID
   * @param variant - The variant of the file
   * @returns The file URL
   */
  static getFileUrl({ fileId, variant }: Core.TGetFileUrlParams): string {
    const { pubky, id } = Core.parseCompositeId(fileId);
    return Core.filesApi.getFileUrl({ pubky, file_id: id, variant });
  }

  /**
   * Transforms and persists file metadata to the local database.
   * Builds composite IDs from URIs, parses URL fields, and saves them locally.
   *
   * @param fileAttachments - Array of file metadata objects already available (no HTTP fetch needed)
   */
  static async persistFiles(fileAttachments: Core.NexusFileDetails[]) {
    if (fileAttachments.length === 0) {
      return;
    }

    const filesWithCompositeIds = fileAttachments.map((file) => {
      const compositeId = Core.buildCompositeIdFromPubkyUri({
        uri: file.uri,
        domain: Core.CompositeIdDomain.FILES,
      });
      return {
        ...file,
        urls: typeof file.urls === 'string' ? (JSON.parse(file.urls) as Core.NexusFileUrls) : file.urls,
        id: compositeId,
      };
    });

    await Core.LocalFileService.createMany({ files: filesWithCompositeIds as Core.NexusFileDetails[] });
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

    const nexusFiles = await Core.NexusFileService.fetchFiles(fileUris);
    await this.persistFiles(nexusFiles);
  }
}
