import * as Core from '@/core';

/**
 * Parameters for reading a user stream chunk (followers, following, friends, etc.)
 * streamId can be:
 * - A composite ID (userId:reach) e.g., 'user123:followers', 'user456:following'
 * - A UserStreamType (source:timeframe:reach) e.g., 'influencers:today:all', 'recommended:all:all'
 *
 * Note: limit is not included as it's controlled by Config.NEXUS_USERS_PER_PAGE
 * viewerId is not included as it's extracted from auth store by the controller
 */
export type TReadUserStreamChunkParams = {
  streamId: Core.UserStreamId;
  limit: number;
  skip: number;
};

/**
 * Internal parameters for fetching user stream (extends public params with limit and viewerId)
 * Used internally by application layer - limit comes from Config.NEXUS_USERS_PER_PAGE
 */
export type TFetchUserStreamChunkParams = TReadUserStreamChunkParams & {
  limit: number;
  viewerId?: Core.Pubky;
};

/**
 * Response from reading a user stream chunk
 */
export type TReadUserStreamChunkResponse = {
  nextPageIds: Core.Pubky[];
  skip: number | undefined;
};

/**
 * Internal response type with cache miss tracking
 */
export type TUserStreamChunkResponse = {
  nextPageIds: Core.Pubky[];
  cacheMissUserIds: Core.Pubky[];
  skip: number | undefined;
};

/**
 * Parameters for fetching missing users
 */
export type TMissingUsersParams = {
  cacheMissUserIds: Core.Pubky[];
  viewerId?: Core.Pubky;
};

export type TFetchStreamFromNexusParams = TFetchUserStreamChunkParams & {
  cachedStream?: { stream: Core.Pubky[] } | null;
};

/**
 * Parameters for getOrFetchUsers (bulk user details by IDs)
 * Used by controller (without viewerId) and application (with viewerId)
 */
export type TGetOrFetchUsersParams = {
  userIds: Core.Pubky[];
  viewerId?: Core.Pubky;
};
