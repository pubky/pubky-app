import { filesApi } from './file.api';
import { HttpMethod } from '@/libs/http/http.types';
import { Logger } from '@/libs/logger/logger';
import type { NexusFileDetails } from '@/services/nexus/nexus.types';
import { queryNexus } from '@/services/nexus/nexus.utils';
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
  static async fetchFiles(fileUris: string[]): Promise<NexusFileDetails[]> {
    if (fileUris.length === 0) {
      return [];
    }

    const { url, body } = filesApi.getFiles(fileUris);
    const files = await queryNexus<NexusFileDetails[]>({
      url,
      method: HttpMethod.POST,
      body: JSON.stringify(body),
    });

    Logger.debug('Files fetched successfully from Nexus', { count: files.length });
    return files;
  }
}
