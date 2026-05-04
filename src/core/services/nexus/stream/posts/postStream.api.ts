import { buildNexusUrl } from '@/services/nexus/nexus.utils';
import {
  STREAM_PREFIX,
  StreamSource,
  type TStreamAllParams,
  type TStreamAuthorParams,
  type TStreamAuthorRepliesParams,
  type TStreamPostRepliesParams,
  type TStreamPostsByIdsParams,
  type TStreamQueryParams,
  type TStreamWithObserverParams,
} from '@/services/nexus/stream/posts/postStream.types';
/**
 * Post stream API Endpoints
 * All API endpoints related to feed operations
 */

function buildPostStreamUrl(params: TStreamQueryParams, source: StreamSource, prefix: STREAM_PREFIX): string {
  const queryParams = new URLSearchParams();

  // Add source parameter
  queryParams.append('source', source);

  // Add all parameters that exist and are not empty strings
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      queryParams.append(key, String(value));
    }
  });

  const relativeUrl = `${prefix}?${queryParams.toString()}`;
  return buildNexusUrl(relativeUrl);
}

/**
 * Type-safe stream URL generators
 */
export const postStreamApi = {
  // All posts (no additional required parameters)
  all: (params: TStreamAllParams) => buildPostStreamUrl(params, StreamSource.ALL, STREAM_PREFIX.POSTS_KEYS),

  // Sources requiring observer_id
  following: (params: TStreamWithObserverParams) =>
    buildPostStreamUrl(params, StreamSource.FOLLOWING, STREAM_PREFIX.POSTS_KEYS),

  followers: (params: TStreamWithObserverParams) =>
    buildPostStreamUrl(params, StreamSource.FOLLOWERS, STREAM_PREFIX.POSTS_KEYS),

  friends: (params: TStreamWithObserverParams) =>
    buildPostStreamUrl(params, StreamSource.FRIENDS, STREAM_PREFIX.POSTS_KEYS),

  bookmarks: (params: TStreamWithObserverParams) =>
    buildPostStreamUrl(params, StreamSource.BOOKMARKS, STREAM_PREFIX.POSTS_KEYS),

  // Post replies requiring author_id and post_id
  post_replies: (params: TStreamPostRepliesParams) =>
    buildPostStreamUrl(params, StreamSource.REPLIES, STREAM_PREFIX.POSTS_KEYS),

  // Author posts requiring author_id
  author: (params: TStreamAuthorParams) => buildPostStreamUrl(params, StreamSource.AUTHOR, STREAM_PREFIX.POSTS_KEYS),

  // Author replies requiring author_id
  author_replies: (params: TStreamAuthorRepliesParams) =>
    buildPostStreamUrl(params, StreamSource.AUTHOR_REPLIES, STREAM_PREFIX.POSTS_KEYS),

  // Posts by IDs (POST request)
  postsByIds: (params: TStreamPostsByIdsParams) => {
    return { body: buildPostStreamBodyUrl(params), url: buildNexusUrl(STREAM_PREFIX.POSTS_BY_IDS) };
  },
};

/**
 * Posts by IDs endpoint (POST request)
 * Returns both the URL and the request body for the POST request
 */
export function buildPostStreamBodyUrl(params: TStreamPostsByIdsParams): TStreamPostsByIdsParams {
  const body: TStreamPostsByIdsParams = {
    post_ids: params.post_ids,
    include_attachment_metadata: params.include_attachment_metadata ?? true,
  };

  if (params.viewer_id) {
    body.viewer_id = params.viewer_id;
  }

  return body;
}

export type PostStreamApiEndpoint = keyof typeof postStreamApi;
