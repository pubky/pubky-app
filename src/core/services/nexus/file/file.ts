import { NEXUS_FILES_BY_IDS_MAX_URIS } from '@/config/nexus';
import { HttpMethod } from '@/libs/http/http.types';
import { Logger } from '@/libs/logger/logger';
import type { NexusFileDetails } from '@/services/nexus/nexus.types';
import { queryNexus } from '@/services/nexus/nexus.utils';
import { filesApi } from './file.api';

/**
 * Nexus File Service
 *
 * Handles fetching file metadata from Nexus API.
 */
export class NexusFileService {
  private constructor() {} // Prevent instantiation

  /**
   * Fetches file metadata from Nexus by file URIs. Nexus takes at most `NEXUS_FILES_BY_IDS_MAX_URIS`
   * per request, so a longer list goes in sequential slices.
   *
   * @param fileUris - Array of file URIs (pubky) to fetch
   * @returns Promise resolving to file metadata from nexus
   */
  static async fetchFiles(fileUris: string[]): Promise<NexusFileDetails[]> {
    if (fileUris.length === 0) {
      return [];
    }

    const files: NexusFileDetails[] = [];
    for (let start = 0; start < fileUris.length; start += NEXUS_FILES_BY_IDS_MAX_URIS) {
      const { url, body } = filesApi.getFiles(fileUris.slice(start, start + NEXUS_FILES_BY_IDS_MAX_URIS));
      files.push(
        ...(await queryNexus<NexusFileDetails[]>({ url, method: HttpMethod.POST, body: JSON.stringify(body) })),
      );
    }

    Logger.debug('Files fetched successfully from Nexus', { count: files.length });
    return files;
  }
}
