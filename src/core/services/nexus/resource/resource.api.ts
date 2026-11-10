import { buildNexusUrl, buildUrlWithQuery } from '@/services/nexus/nexus.utils';
import type { TResourceByUriParams } from '@/services/nexus/resource/resource.types';

/**
 * Resource API Endpoints
 *
 * External resources (web links and other non-Pubky URIs) people tagged.
 */

const PREFIX = 'v0/resource';

export const resourceApi = {
  byUri: (params: TResourceByUriParams) => buildUrlWithQuery({ baseRoute: `${PREFIX}/by-uri`, params }),
  /** The endpoint without its query string, for error context: the query carries a link from someone's post. */
  byUriEndpoint: () => buildNexusUrl(`${PREFIX}/by-uri`),
};

export type ResourceApiEndpoint = keyof typeof resourceApi;
