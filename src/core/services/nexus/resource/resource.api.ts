import { buildNexusUrl, buildUrlWithQuery } from '@/services/nexus/nexus.utils';
import type { TResourceByUriParams } from '@/services/nexus/resource/resource.types';

type TResourceRepliesQuery = {
  viewer_id?: string;
  skip?: number;
  limit?: number;
};

/**
 * Resource API Endpoints
 *
 * External resources (web links and other non-Pubky URIs) people tagged.
 */

const PREFIX = 'resource';

export const resourceApi = {
  byUri: (params: TResourceByUriParams) => buildUrlWithQuery({ baseRoute: `${PREFIX}/by-uri`, params }),
  /** The endpoint without its query string, for error context: the query carries a link from someone's post. */
  byUriEndpoint: () => buildNexusUrl(`${PREFIX}/by-uri`),
  /**
   * The live posts whose `parent` is the resource, newest first. Our Nexus fork only: it also refuses
   * `include_attachment_metadata` here.
   */
  replies: (resourceId: string, params: TResourceRepliesQuery) =>
    buildUrlWithQuery({ baseRoute: `${PREFIX}/${encodeURIComponent(resourceId)}/replies`, params }),
};

export type ResourceApiEndpoint = keyof typeof resourceApi;
