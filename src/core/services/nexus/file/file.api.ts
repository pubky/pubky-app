import type { Pubky } from '@/models/models.types';
import type { TFileBody, TFileParams } from '@/services/nexus/file/file.types';
import { buildCdnUrl, buildNexusUrl, buildV1CdnUrl, encodePathSegment } from '@/services/nexus/nexus.utils';

/**
 * Files API Endpoints
 *
 * All API endpoints related to files operations
 */

const API_PREFIX = 'v0/files';
const STATIC_PREFIX = 'files';

/**
 * Files by IDs endpoint (POST request)
 * Returns both the URL and the request body for the POST request
 */
export function buildFileBodyUrl(fileUris: Pubky[]) {
  // Build request body
  const body: TFileBody = { uris: fileUris };
  return body;
}

export const filesApi = {
  getAvatarUrl: (pubky: Pubky, version?: string | number) => {
    const encodedPubky = encodePathSegment(pubky);
    const url = buildCdnUrl(`avatar/${encodedPubky}`);
    return version ? `${url}?v=${version}` : url;
  },
  getFileUrl: ({ pubky, file_id, variant }: TFileParams) => {
    const encodedPubky = encodePathSegment(pubky);
    const encodedFileId = encodePathSegment(file_id);
    const path = `${STATIC_PREFIX}/${encodedPubky}/${encodedFileId}/${variant}`;
    // The form of the id picks the route: `{hash}.{ext}` is v1 (a bare hash is a 400), a 0.x id has no dot.
    return file_id.includes('.') ? buildV1CdnUrl(path) : buildCdnUrl(path);
  },
  getFiles: (fileUris: Pubky[]) => ({
    body: buildFileBodyUrl(fileUris),
    url: buildNexusUrl(`${API_PREFIX}/by_ids`),
  }),
};

export type FilesApiEndpoint = keyof typeof filesApi;
