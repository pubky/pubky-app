import type { NexusApiVersion } from '@/config/nexus';
import type { Pubky } from '@/models/models.types';
import type { TFileBody, TFileParams } from '@/services/nexus/file/file.types';
import { buildCdnUrl, buildNexusUrl, buildV1CdnUrl, encodePathSegment } from '@/services/nexus/nexus.utils';

/**
 * Files API Endpoints
 *
 * All API endpoints related to files operations
 */

const API_PREFIX = 'files';
const STATIC_PREFIX = 'files';

/**
 * The one Nexus call that stays on the frozen `/v0` API. A 0.x attachment URI
 * (`pubky://{owner}/pub/pubky.app/files/{tsid}`) carries no extension and no type, and only Nexus
 * knows its `content_type`, `name`, `size` and variant URLs; `/v1` serves no file details (neither
 * `attachments_metadata` nor a `files/by_ids` route: `POST /v1/files/by_ids` is a 404). Un-migrated authors
 * keep such posts for as long as they have not opened the new app, so without this call their images
 * would render as generic file cards for every viewer (D10). A v1 address in the body is not an error:
 * `/v0/files/by_ids` skips it with a server-side warning and answers 200 with the rest (Nexus contract,
 * verified live on the carrier). The callers still never send one: `FileApplication.fetchFiles` and
 * `fetchFilesForPosts` drop every v1 address first, since Nexus has nothing to say about it.
 *
 * Sunset: remove this call, with `NexusFileService.fetchFiles` and `FileApplication.fetchFiles*`, when `/v0`
 * gets a removal date or every author has migrated (ADR-0027, _Nexus API version_). The compliance
 * gate (`social-v1-compliance.gate.test.ts`) lets no other file name this version.
 */
const FILE_DETAILS_API_VERSION: NexusApiVersion = 'v0';

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
    url: buildNexusUrl(`${API_PREFIX}/by_ids`, { version: FILE_DETAILS_API_VERSION }),
  }),
};

export type FilesApiEndpoint = keyof typeof filesApi;
