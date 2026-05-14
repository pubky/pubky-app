import type { TUserId } from '@/services/nexus/nexus.types';
import { buildNexusUrl, buildUrlWithQuery, encodePathSegment } from '@/services/nexus/nexus.utils';
import {
  type TUserPaginationParams,
  type TUserRelationshipParams,
  type TUserTaggersParams,
  type TUserTagsParams,
  type TUserViewParams,
  USER_PATH_PARAMS,
} from '@/services/nexus/user/user.types';

/**
 * User API Endpoints
 *
 * All API endpoints related to user operations
 */

const PREFIX = 'v0/user';

export const userApi = {
  view: (params: TUserViewParams) => {
    const userId = encodePathSegment(params.user_id);
    return buildUrlWithQuery({ baseRoute: `${PREFIX}/${userId}`, params, excludeKeys: USER_PATH_PARAMS });
  },
  counts: (params: TUserId) => {
    const userId = encodePathSegment(params.user_id);
    return buildNexusUrl(`${PREFIX}/${userId}/counts`);
  },
  details: (params: TUserId) => {
    const userId = encodePathSegment(params.user_id);
    return buildNexusUrl(`${PREFIX}/${userId}/details`);
  },
  followers: (params: TUserViewParams) => {
    const userId = encodePathSegment(params.user_id);
    return buildUrlWithQuery({
      baseRoute: `${PREFIX}/${userId}/followers`,
      params,
      excludeKeys: USER_PATH_PARAMS,
    });
  },
  following: (params: TUserViewParams) => {
    const userId = encodePathSegment(params.user_id);
    return buildUrlWithQuery({
      baseRoute: `${PREFIX}/${userId}/following`,
      params,
      excludeKeys: USER_PATH_PARAMS,
    });
  },
  friends: (params: TUserViewParams) => {
    const userId = encodePathSegment(params.user_id);
    return buildUrlWithQuery({
      baseRoute: `${PREFIX}/${userId}/friends`,
      params,
      excludeKeys: USER_PATH_PARAMS,
    });
  },
  notifications: (params: TUserPaginationParams) => {
    const userId = encodePathSegment(params.user_id);
    return buildUrlWithQuery({
      baseRoute: `${PREFIX}/${userId}/notifications`,
      params,
      excludeKeys: USER_PATH_PARAMS,
    });
  },
  relationship: (params: TUserRelationshipParams) => {
    const userId = encodePathSegment(params.user_id);
    const viewerId = encodePathSegment(params.viewer_id);
    return buildNexusUrl(`${PREFIX}/${userId}/relationship/${viewerId}`);
  },
  taggers: (params: TUserTaggersParams) => {
    const userId = encodePathSegment(params.user_id);
    const label = encodePathSegment(params.label);
    return buildUrlWithQuery({
      baseRoute: `${PREFIX}/${userId}/taggers/${label}`,
      params,
      excludeKeys: USER_PATH_PARAMS,
    });
  },
  tags: (params: TUserTagsParams) => {
    const userId = encodePathSegment(params.user_id);
    return buildUrlWithQuery({
      baseRoute: `${PREFIX}/${userId}/tags`,
      params,
      excludeKeys: USER_PATH_PARAMS,
    });
  },
};

export type UserApiEndpoint = keyof typeof userApi;
