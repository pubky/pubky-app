import * as Core from '@/core';

/**
 * Post stream API Endpoints
 * All API endpoints related to feed operations
 */

function buildPostStreamUrl(
  params: Core.TStreamQueryParams,
  source: Core.StreamSource,
  prefix: Core.STREAM_PREFIX,
): string {
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
  return Core.buildNexusUrl(relativeUrl);
}

/**
 * Type-safe stream URL generators
 */
export const postStreamApi = {
  // All posts (no additional required parameters)
  all: (params: Core.TStreamAllParams) =>
    buildPostStreamUrl(params, Core.StreamSource.ALL, Core.STREAM_PREFIX.POSTS_KEYS),

  // Sources requiring observer_id
  following: (params: Core.TStreamWithObserverParams) =>
    buildPostStreamUrl(params, Core.StreamSource.FOLLOWING, Core.STREAM_PREFIX.POSTS_KEYS),

  followers: (params: Core.TStreamWithObserverParams) =>
    buildPostStreamUrl(params, Core.StreamSource.FOLLOWERS, Core.STREAM_PREFIX.POSTS_KEYS),

  friends: (params: Core.TStreamWithObserverParams) =>
    buildPostStreamUrl(params, Core.StreamSource.FRIENDS, Core.STREAM_PREFIX.POSTS_KEYS),

  bookmarks: (params: Core.TStreamWithObserverParams) =>
    buildPostStreamUrl(params, Core.StreamSource.BOOKMARKS, Core.STREAM_PREFIX.POSTS_KEYS),

  // Post replies requiring author_id and post_id
  post_replies: (params: Core.TStreamPostRepliesParams) =>
    buildPostStreamUrl(params, Core.StreamSource.REPLIES, Core.STREAM_PREFIX.POSTS_KEYS),

  // Author posts requiring author_id
  author: (params: Core.TStreamAuthorParams) =>
    buildPostStreamUrl(params, Core.StreamSource.AUTHOR, Core.STREAM_PREFIX.POSTS_KEYS),

  // Author replies requiring author_id
  author_replies: (params: Core.TStreamAuthorRepliesParams) =>
    buildPostStreamUrl(params, Core.StreamSource.AUTHOR_REPLIES, Core.STREAM_PREFIX.POSTS_KEYS),

  // Posts by IDs (POST request)
  postsByIds: (params: Core.TStreamPostsByIdsParams) => {
    return { body: buildPostStreamBodyUrl(params), url: Core.buildNexusUrl(Core.STREAM_PREFIX.POSTS_BY_IDS) };
  },
};

/**
 * Posts by IDs endpoint (POST request)
 * Returns both the URL and the request body for the POST request
 */
export function buildPostStreamBodyUrl(params: Core.TStreamPostsByIdsParams): Core.TStreamPostsByIdsParams {
  const body: Core.TStreamPostsByIdsParams = {
    post_ids: params.post_ids,
    include_attachment_metadata: params.include_attachment_metadata ?? true,
  };

  if (params.viewer_id) {
    body.viewer_id = params.viewer_id;
  }

  return body;
}

export type PostStreamApiEndpoint = keyof typeof postStreamApi;
