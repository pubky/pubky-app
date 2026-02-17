import * as Core from '@/core';

const DELIMITER = ':';

/**
 * Create Nexus API parameters from a user stream ID
 *
 * Transforms stream identifiers into type-safe parameters for userStreamApi methods.
 * The apiParams type is automatically mapped to the correct type based on reach.
 *
 * Handles two formats:
 * - 2 parts: `userId:reach` (e.g., 'user123:followers')
 * - 3 parts: `source:timeframe:reach` (e.g., 'influencers:today:all')
 *
 * @param streamId - Stream identifier
 * @param baseParams - Base pagination/query parameters
 * @returns Object with reach and correctly typed apiParams for that reach
 *
 * @example
 * const { reach, apiParams } = createUserStreamParams('user123:followers', { skip: 0, limit: 20 });
 * // reach: 'followers', apiParams: TUserStreamWithUserIdParams (inferred!)
 * const url = userStreamApi[reach](apiParams); // Fully type-safe!
 */
export function createUserStreamParams(
  streamId: Core.UserStreamId,
  baseParams: Core.TUserStreamBase,
): NexusParamsResult<ReachType> {
  const parts = streamId.split(DELIMITER);

  // If we are dealing with userId:reach format
  if (parts.length === 2) {
    const [userId, reach] = parts;
    return {
      reach: reach as ReachType,
      apiParams: { user_id: userId as Core.Pubky, ...baseParams } as UserStreamApiParamsMap[ReachType],
    };
  }

  // If we are dealing with source:timeframe:reach format
  if (parts.length === 3) {
    const [source, timeframe, reach] = parts;

    // Influencers need timeframe and optionally reach in params
    // Note: 'all' is not a valid API value for reach - omit it to get all users
    // API requires user_id and reach to be provided together
    if (source === Core.UserStreamSource.INFLUENCERS) {
      return {
        reach: source,
        apiParams: {
          ...baseParams,
          timeframe: timeframe as Core.UserStreamTimeframe,
          // Only include reach if it's a valid API value (not 'all')
          ...(reach !== 'all' && { reach: reach as Core.UserStreamReach }),
          ...(reach !== 'all' && baseParams.viewer_id && { user_id: baseParams.viewer_id }),
        },
      } as NexusParamsResult<'influencers'>;
    }

    // For sources that require user_id (followers, following, friends, muted, recommended),
    // add user_id from viewer_id when available
    if (streamRequiresUserId(streamId) && baseParams.viewer_id) {
      return {
        reach: source as ReachType,
        apiParams: {
          ...baseParams,
          user_id: baseParams.viewer_id,
        } as UserStreamApiParamsMap[ReachType],
      };
    }

    // Other 3-part formats use base params only
    return {
      reach: source as ReachType,
      apiParams: baseParams as UserStreamApiParamsMap[ReachType],
    };
  }

  throw new Error(`Invalid stream ID: "${streamId}". Expected 2 or 3 parts separated by "${DELIMITER}"`);
}

/**
 * Sources that require user_id parameter according to Nexus API documentation
 * https://nexus.staging.pubky.app/swagger-ui/#/Stream/stream_user_ids_handler
 */
const SOURCES_REQUIRING_USER_ID = ['followers', 'following', 'friends', 'muted', 'recommended'] as const;

/**
 * Check if a stream ID corresponds to a source that requires user_id
 *
 * @param streamId - Stream identifier
 * @returns true if the source requires user_id parameter
 */
export function streamRequiresUserId(streamId: Core.UserStreamId): boolean {
  return SOURCES_REQUIRING_USER_ID.some((source) => streamId.startsWith(source));
}

type UserStreamApiParamsMap = {
  followers: Core.TUserStreamWithUserIdParams;
  following: Core.TUserStreamWithUserIdParams;
  friends: Core.TUserStreamWithUserIdParams;
  muted: Core.TUserStreamWithUserIdParams;
  recommended: Core.TUserStreamWithUserIdParams;
  influencers: Core.TUserStreamInfluencersParams;
  most_followed: Core.TUserStreamBase;
};

type ReachType = keyof UserStreamApiParamsMap;

type NexusParamsResult<T extends ReachType> = {
  reach: T;
  apiParams: UserStreamApiParamsMap[T];
};
