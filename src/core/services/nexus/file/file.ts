import * as Core from '@/core';
import { filesApi } from './file.api';
import { HttpMethod } from '@/libs/http/http.types';
import { Logger } from '@/libs/logger/logger';

/**
 * Nexus File Service
 *
 * Handles fetching file metadata from Nexus API.
 */
export class NexusFileService {
  private constructor() {} // Prevent instantiation

  /**
   * Fetches file metadata from Nexus by file URIs.
   *
   * @param fileUris - Array of file URIs (pubky) to fetch
   * @returns Promise resolving to file metadata from nexus
   */
  static async fetchFiles(fileUris: string[]): Promise<Core.NexusFileDetails[]> {
    if (fileUris.length === 0) {
      return [];
    }

    const { url, body } = filesApi.getFiles(fileUris);
    const files = await Core.queryNexus<Core.NexusFileDetails[]>({
      url,
      method: HttpMethod.POST,
      body: JSON.stringify(body),
    });

    Logger.debug('Files fetched successfully from Nexus', { count: files.length });
    return files;
  }
}
