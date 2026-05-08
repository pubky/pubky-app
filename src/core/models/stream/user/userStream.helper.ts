import type { Pubky } from '@/models/models.types';
import { UserStreamModelSchema } from './userStream.schema';
import { UserStreamCompositeId, UserStreamId } from './userStream.types';

export const USER_STREAM_ID_DELIMITER = ':' as const;

/**
 * Parts of a user stream composite ID
 */
export type UserStreamIdParts = {
  userId: Pubky;
  reach: string; // 'followers', 'following', 'friends', etc.
};

/**
 * Build a composite ID for user stream storage in IndexedDB
 * Format: userId:reach
 *
 * @example
 * buildUserCompositeId({
 *   userId: 'user-ABC',
 *   reach: 'followers'
 * })
 * // Returns: 'user-ABC:followers'
 */
export function buildUserCompositeId({ userId, reach }: UserStreamIdParts): UserStreamCompositeId {
  return `${userId}${USER_STREAM_ID_DELIMITER}${reach}` as UserStreamCompositeId;
}

/**
 * Parse a composite user stream ID back into its parts
 *
 * @example
 * parseUserCompositeId('user-ABC:followers')
 * // Returns: { userId: 'user-ABC', reach: 'followers' }
 */
export function parseUserCompositeId(compositeId: string): UserStreamIdParts {
  const sep = compositeId.indexOf(USER_STREAM_ID_DELIMITER);
  if (sep <= 0 || sep === compositeId.length - 1) {
    throw new Error(`Invalid user stream composite ID: ${compositeId}`);
  }

  return {
    userId: compositeId.substring(0, sep) as Pubky,
    reach: compositeId.substring(sep + 1),
  };
}

export const createDefaultUserStream = (id: UserStreamId, stream: Pubky[] = []): UserStreamModelSchema => {
  return {
    id,
    stream,
  };
};
