import { buildNexusUrl, buildUrlWithQuery, encodePathSegment } from '@/services/nexus/nexus.utils';
import {
  POST_PATH_PARAMS,
  type TPostBase,
  type TPostBasePathParams,
  type TPostTaggersParams,
  type TPostTagsParams,
  type TPostViewParams,
} from '@/services/nexus/post/post.types';
/**
 * Post API Endpoints
 *
 * All API endpoints related to post operations
 */

const PREFIX = 'v0/post';

export const postApi = {
  view: (params: TPostViewParams) => {
    const author = encodePathSegment(params.author_id);
    const post = encodePathSegment(params.post_id);
    return buildUrlWithQuery({
      baseRoute: `${PREFIX}/${author}/${post}`,
      params,
      excludeKeys: POST_PATH_PARAMS,
    });
  },
  bookmarks: (params: TPostBase) => {
    const author = encodePathSegment(params.author_id);
    const post = encodePathSegment(params.post_id);
    return buildUrlWithQuery({
      baseRoute: `${PREFIX}/${author}/${post}/bookmarks`,
      params,
      excludeKeys: POST_PATH_PARAMS,
    });
  },
  counts: (params: TPostBasePathParams) => {
    const author = encodePathSegment(params.author_id);
    const post = encodePathSegment(params.post_id);
    return buildNexusUrl(`${PREFIX}/${author}/${post}/counts`);
  },
  details: (params: TPostBasePathParams) => {
    const author = encodePathSegment(params.author_id);
    const post = encodePathSegment(params.post_id);
    return buildNexusUrl(`${PREFIX}/${author}/${post}/details`);
  },
  taggers: (params: TPostTaggersParams) => {
    const author = encodePathSegment(params.author_id);
    const post = encodePathSegment(params.post_id);
    const label = encodePathSegment(params.label);
    return buildUrlWithQuery({
      baseRoute: `${PREFIX}/${author}/${post}/taggers/${label}`,
      params,
      excludeKeys: POST_PATH_PARAMS,
    });
  },
  tags: (params: TPostTagsParams) => {
    const author = encodePathSegment(params.author_id);
    const post = encodePathSegment(params.post_id);
    return buildUrlWithQuery({
      baseRoute: `${PREFIX}/${author}/${post}/tags`,
      params,
      excludeKeys: POST_PATH_PARAMS,
    });
  },
};

export type PostApiEndpoint = keyof typeof postApi;
