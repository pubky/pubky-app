import { STARTER_PACK_MAX_TAGS } from '@/config/nexus';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { canonicalizeTagLabel, isStarterPackReservedTag, isValidTagLabel } from '@/libs/utils/utils';
import type { Pubky } from '@/models/models.types';
import { USER_STREAM_TAG_DELIMITER } from '@/models/stream/user/userStream.helper';
import { STARTER_PACK_STREAM_SOURCE, type UserStreamId } from '@/models/stream/user/userStream.types';
import type { UserStreamReach, UserStreamTimeframe } from '@/services/nexus/nexus.types';
import {
  type TUserStreamBase,
  type TUserStreamInfluencersParams,
  type TUserStreamStarterPackParams,
  type TUserStreamWithUserIdParams,
  UserStreamSource,
} from '@/services/nexus/stream/users/userStream.types';

const DELIMITER = ':';
const MUTED_STREAM_UNSUPPORTED_MESSAGE =
  'Muted user lists are homeserver-backed only; they are not available as Nexus user streams.';

function throwMutedStreamUnsupported(streamId: UserStreamId): never {
  throw Err.validation(ValidationErrorCode.INVALID_INPUT, MUTED_STREAM_UNSUPPORTED_MESSAGE, {
    service: ErrorService.Nexus,
    operation: 'createUserStreamParams',
    context: { streamId },
  });
}

/**
 * Create Nexus API parameters from a user stream ID
 *
 * Transforms stream identifiers into type-safe parameters for userStreamApi methods.
 * The apiParams type is automatically mapped to the correct type based on reach.
 *
 * Handles three formats:
 * - 2 parts: `userId:reach` (e.g., 'user123:followers')
 * - 3 parts: `source:timeframe:reach` (e.g., 'influencers:today:all')
 * - 4 parts: `source:timeframe:reach:tags` (e.g., 'starter_pack:all:all:bitcoin,music')
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
  streamId: UserStreamId,
  baseParams: TUserStreamBase,
): NexusParamsResult<ReachType> {
  const parts = streamId.split(DELIMITER);

  // If we are dealing with userId:reach format
  if (parts.length === 2) {
    const [userId, reach] = parts;
    if (reach === 'muted') {
      throwMutedStreamUnsupported(streamId);
    }
    if (reach === STARTER_PACK_STREAM_SOURCE) {
      throw Err.validation(
        ValidationErrorCode.INVALID_INPUT,
        'Starter pack stream IDs require the source:all:all:tags format',
        {
          service: ErrorService.Nexus,
          operation: 'createUserStreamParams',
          context: { streamId },
        },
      );
    }
    return {
      reach: reach as ReachType,
      apiParams: { user_id: userId as Pubky, ...baseParams } as UserStreamApiParamsMap[ReachType],
    };
  }

  // If we are dealing with source:timeframe:reach format
  if (parts.length === 3) {
    const [source, timeframe, reach] = parts;
    if (source === 'muted') {
      throwMutedStreamUnsupported(streamId);
    }
    if (source === STARTER_PACK_STREAM_SOURCE) {
      throw Err.validation(
        ValidationErrorCode.INVALID_INPUT,
        'Starter pack stream IDs require the source:all:all:tags format',
        {
          service: ErrorService.Nexus,
          operation: 'createUserStreamParams',
          context: { streamId },
        },
      );
    }

    // Influencers need timeframe and optionally reach in params
    // Note: 'all' is not a valid API value for reach - omit it to get all users
    // API requires user_id and reach to be provided together
    if (source === UserStreamSource.INFLUENCERS) {
      return {
        reach: source,
        apiParams: {
          ...baseParams,
          timeframe: timeframe as UserStreamTimeframe,
          // Only include reach if it's a valid API value (not 'all')
          ...(reach !== 'all' && { reach: reach as UserStreamReach }),
          ...(reach !== 'all' && baseParams.viewer_id && { user_id: baseParams.viewer_id }),
        },
      } as NexusParamsResult<'influencers'>;
    }

    // For sources that require user_id (followers, following, friends, recommended),
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

  // If we are dealing with source:timeframe:reach:tags format (starter pack only; tags cannot
  // contain ':' so 4 parts is exact)
  if (parts.length === 4) {
    const [source, timeframe, reach, tagSegment] = parts;

    if (source !== STARTER_PACK_STREAM_SOURCE) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Only starter pack stream IDs carry a tag segment', {
        service: ErrorService.Nexus,
        operation: 'createUserStreamParams',
        context: { streamId },
      });
    }

    // Starter pack requests are always all-time/all-reach; accepting other values here would
    // create misleading duplicate cache rows that all map to the same Nexus request
    if (timeframe !== 'all' || reach !== 'all') {
      throw Err.validation(
        ValidationErrorCode.INVALID_INPUT,
        'Starter pack stream IDs require "all" timeframe and reach segments',
        {
          service: ErrorService.Nexus,
          operation: 'createUserStreamParams',
          context: { streamId },
        },
      );
    }

    const tags = tagSegment.split(USER_STREAM_TAG_DELIMITER);
    const hasInvalidLabel = tags.some(
      (label) => label !== canonicalizeTagLabel(label) || !isValidTagLabel(label) || isStarterPackReservedTag(label),
    );
    const hasDuplicateLabel = new Set(tags).size !== tags.length;
    if (tags.length > STARTER_PACK_MAX_TAGS || hasInvalidLabel || hasDuplicateLabel) {
      throw Err.validation(
        ValidationErrorCode.INVALID_INPUT,
        `Starter pack stream IDs require 1-${STARTER_PACK_MAX_TAGS} unique canonical (trimmed, lowercase) tags that are not reserved by Nexus`,
        {
          service: ErrorService.Nexus,
          operation: 'createUserStreamParams',
          context: { streamId },
        },
      );
    }

    return {
      reach: 'starter_pack',
      apiParams: {
        ...baseParams,
        tags: tagSegment,
      },
    } as NexusParamsResult<'starter_pack'>;
  }

  throw Err.validation(
    ValidationErrorCode.INVALID_INPUT,
    `Invalid stream ID: expected 2, 3, or 4 parts separated by "${DELIMITER}"`,
    {
      service: ErrorService.Nexus,
      operation: 'createUserStreamParams',
      context: { streamId },
    },
  );
}

/**
 * Sources that require user_id parameter according to Nexus API documentation
 * https://nexus.staging.pubky.app/swagger-ui/#/Stream/stream_user_ids_handler
 */
const SOURCES_REQUIRING_USER_ID = ['followers', 'following', 'friends', 'recommended'] as const;

/**
 * Check if a stream ID corresponds to a source that requires user_id
 *
 * @param streamId - Stream identifier
 * @returns true if the source requires user_id parameter
 */
export function streamRequiresUserId(streamId: UserStreamId): boolean {
  return SOURCES_REQUIRING_USER_ID.some((source) => streamId.startsWith(source));
}

type UserStreamApiParamsMap = {
  followers: TUserStreamWithUserIdParams;
  following: TUserStreamWithUserIdParams;
  friends: TUserStreamWithUserIdParams;
  recommended: TUserStreamWithUserIdParams;
  influencers: TUserStreamInfluencersParams;
  most_followed: TUserStreamBase;
  starter_pack: TUserStreamStarterPackParams;
};

type ReachType = keyof UserStreamApiParamsMap;

type NexusParamsResult<T extends ReachType> = {
  reach: T;
  apiParams: UserStreamApiParamsMap[T];
};
