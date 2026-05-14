import { buildNexusUrl, buildUrlWithQuery, encodePathSegment } from '@/services/nexus/nexus.utils';
import {
  TAGS_PATH_PARAMS,
  type TTagHotParams,
  type TTagTaggersParams,
  type TTagViewParams,
} from '@/services/nexus/tag/tag.types';

/**
 * Tag API Endpoints
 *
 * All API endpoints related to tag operations
 */

const PREFIX = 'v0/tags';

export const tagApi = {
  view: (params: TTagViewParams) => {
    const taggerId = encodePathSegment(params.taggerId);
    const tagId = encodePathSegment(params.tagId);
    return buildNexusUrl(`${PREFIX}/${taggerId}/${tagId}`);
  },
  hot: (params: TTagHotParams) =>
    buildUrlWithQuery({ baseRoute: `${PREFIX}/hot`, params, excludeKeys: TAGS_PATH_PARAMS }),
  taggers: (params: TTagTaggersParams) => {
    const label = encodePathSegment(params.label);
    return buildUrlWithQuery({
      baseRoute: `${PREFIX}/taggers/${label}`,
      params,
      excludeKeys: TAGS_PATH_PARAMS,
    });
  },
};

export type TagApiEndpoint = keyof typeof tagApi;
