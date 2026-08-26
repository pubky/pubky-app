import { buildUrlWithQuery, encodePathSegment } from '@/services/nexus/nexus.utils';
import {
  SEARCH_PATH_PARAMS,
  type TPrefixSearchParams,
  type TTagSearchParams,
  type TUsersByTagsSearchParams,
} from '@/services/nexus/search/search.types';

/**
 * Search API Endpoints
 *
 * All API endpoints related to search operations
 */

const PREFIX = 'v0/search';

export const searchApi = {
  byTag: (params: TTagSearchParams) => {
    const tag = encodePathSegment(params.tag);
    return buildUrlWithQuery({
      baseRoute: `${PREFIX}/posts/by_tag/${tag}`,
      params,
      excludeKeys: SEARCH_PATH_PARAMS,
    });
  },
  byPrefix: (params: TPrefixSearchParams) => {
    const prefix = encodePathSegment(params.prefix);
    return buildUrlWithQuery({
      baseRoute: `${PREFIX}/tags/by_prefix/${prefix}`,
      params,
      excludeKeys: SEARCH_PATH_PARAMS,
    });
  },
  byUser: (params: TPrefixSearchParams) => {
    const prefix = encodePathSegment(params.prefix);
    return buildUrlWithQuery({
      baseRoute: `${PREFIX}/users/by_id/${prefix}`,
      params,
      excludeKeys: SEARCH_PATH_PARAMS,
    });
  },
  byUsername: (params: TPrefixSearchParams) => {
    const prefix = encodePathSegment(params.prefix);
    return buildUrlWithQuery({
      baseRoute: `${PREFIX}/users/by_name/${prefix}`,
      params,
      excludeKeys: SEARCH_PATH_PARAMS,
    });
  },
  // `tags` is a query param here (unlike the path-segment routes above)
  byTags: (params: TUsersByTagsSearchParams) =>
    buildUrlWithQuery({
      baseRoute: `${PREFIX}/users/by_tags`,
      params,
    }),
};

export type SearchApiEndpoint = keyof typeof searchApi;
