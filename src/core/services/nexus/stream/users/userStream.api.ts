import { buildNexusUrl } from '@/services/nexus/nexus.utils';
import {
  type TUserStreamBase,
  type TUserStreamInfluencersParams,
  type TUserStreamPostRepliesParams,
  type TUserStreamQueryParams,
  type TUserStreamUsernameParams,
  type TUserStreamUsersByIdsParams,
  type TUserStreamWithDepthParams,
  type TUserStreamWithUserIdParams,
  USER_STREAM_PREFIX,
  UserStreamSource,
} from '@/services/nexus/stream/users/userStream.types';

/**
 * Users Stream API Endpoints
 * All API endpoints related to user stream operations
 */

function buildUserStreamUrl(
  params: TUserStreamQueryParams,
  source: UserStreamSource | null,
  prefix: USER_STREAM_PREFIX,
): string {
  const queryParams = new URLSearchParams();

  // Add source parameter
  if (source) {
    queryParams.append('source', source);
  }

  // Add all parameters that exist
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      // Filter out negative values for skip and limit
      if ((key === 'skip' || key === 'limit') && typeof value === 'number' && value < 0) {
        return;
      }
      queryParams.append(key, String(value));
    }
  });

  const relativeUrl = `${prefix}?${queryParams.toString()}`;
  return buildNexusUrl(relativeUrl);
}

/**
 * Type-safe user stream URL generators
 */
export const userStreamApi = {
  // Sources requiring user_id
  followers: (params: TUserStreamWithUserIdParams) =>
    buildUserStreamUrl(params, UserStreamSource.FOLLOWERS, USER_STREAM_PREFIX.USER_IDS),

  following: (params: TUserStreamWithUserIdParams) =>
    buildUserStreamUrl(params, UserStreamSource.FOLLOWING, USER_STREAM_PREFIX.USER_IDS),

  friends: (params: TUserStreamWithUserIdParams) =>
    buildUserStreamUrl(params, UserStreamSource.FRIENDS, USER_STREAM_PREFIX.USER_IDS),

  muted: (params: TUserStreamWithUserIdParams) =>
    buildUserStreamUrl(params, UserStreamSource.MUTED, USER_STREAM_PREFIX.USER_IDS),

  recommended: (params: TUserStreamWithUserIdParams) =>
    buildUserStreamUrl(params, UserStreamSource.RECOMMENDED, USER_STREAM_PREFIX.USER_IDS),

  // Influencers with additional parameters
  influencers: (params: TUserStreamInfluencersParams) =>
    buildUserStreamUrl(params, UserStreamSource.INFLUENCERS, USER_STREAM_PREFIX.USER_IDS),

  // Post replies requiring author_id and post_id
  postReplies: (params: TUserStreamPostRepliesParams) =>
    buildUserStreamUrl(params, UserStreamSource.POST_REPLIES, USER_STREAM_PREFIX.USER_IDS),

  // Sources with depth parameter
  friendsWithDepth: (params: TUserStreamWithDepthParams) =>
    buildUserStreamUrl(params, UserStreamSource.FRIENDS, USER_STREAM_PREFIX.USER_IDS),

  mostFollowed: (params: TUserStreamBase) =>
    buildUserStreamUrl(params, UserStreamSource.MOST_FOLLOWED, USER_STREAM_PREFIX.USER_IDS),

  // Username search
  username: (params: TUserStreamUsernameParams) => buildUserStreamUrl(params, null, USER_STREAM_PREFIX.USERNAME),

  // Users by IDs (POST request)
  usersByIds: (params: TUserStreamUsersByIdsParams) => {
    return {
      body: buildUserStreamBodyUrl(params),
      url: buildNexusUrl(USER_STREAM_PREFIX.USERS_BY_IDS),
    };
  },
};

/**
 * Users by IDs endpoint (POST request)
 * Returns both the URL and the request body for the POST request
 */
export function buildUserStreamBodyUrl(params: TUserStreamUsersByIdsParams) {
  // Build request body
  const body: { user_ids: string[]; viewer_id?: string; depth?: number } = {
    user_ids: params.user_ids,
  };

  if (params.viewer_id) {
    body.viewer_id = params.viewer_id;
  }

  if (params.depth !== undefined) {
    body.depth = params.depth;
  }

  return body;
}

export type UserStreamApiEndpoint = keyof typeof userStreamApi;
