import { STARTER_PACK_MAX_TAGS } from '@/config/nexus';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { canonicalizeTagLabel, isValidTagLabel } from '@/libs/utils/utils';
import type { Pubky } from '@/models/models.types';
import { UserStreamModelSchema } from './userStream.schema';
import {
  STARTER_PACK_STREAM_SOURCE,
  type StarterPackStreamId,
  UserStreamCompositeId,
  UserStreamId,
} from './userStream.types';

export const USER_STREAM_ID_DELIMITER = ':' as const;
export const USER_STREAM_TAG_DELIMITER = ',' as const;

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

/**
 * Build a starter pack stream ID from ordered interest tags.
 *
 * Labels are canonicalized (trimmed + lowercased) so 'Bitcoin' and 'bitcoin' resolve to the same
 * Dexie row, then validated against the canonical tag contract (1-20 chars, no banned characters)
 * and the Nexus starter pack limit (1-5 tags). Order is preserved: Nexus interleaves per-tag
 * rankings in the order given, so ['travel','music'] and ['music','travel'] are different streams.
 *
 * @example
 * buildStarterPackStreamId(['Bitcoin ', 'music'])
 * // Returns: 'starter_pack:all:all:bitcoin,music'
 */
// Exported for the starter-pack onboarding consumer (#2388).
export function buildStarterPackStreamId(tags: string[]): StarterPackStreamId {
  const canonical = [...new Set(tags.map(canonicalizeTagLabel))];

  if (canonical.length === 0 || canonical.length > STARTER_PACK_MAX_TAGS) {
    throw Err.validation(
      ValidationErrorCode.INVALID_INPUT,
      `Starter pack streams require 1-${STARTER_PACK_MAX_TAGS} tags`,
      {
        service: ErrorService.Local,
        operation: 'buildStarterPackStreamId',
        context: { tagCount: canonical.length },
      },
    );
  }

  const invalidLabels = canonical.filter((tag) => !isValidTagLabel(tag));
  if (invalidLabels.length > 0) {
    throw Err.validation(
      ValidationErrorCode.INVALID_INPUT,
      'Starter pack tags must be 1-20 characters without banned characters',
      {
        service: ErrorService.Local,
        operation: 'buildStarterPackStreamId',
        context: { invalidLabels },
      },
    );
  }

  return `${STARTER_PACK_STREAM_SOURCE}:all:all:${canonical.join(USER_STREAM_TAG_DELIMITER)}`;
}

export const createDefaultUserStream = (id: UserStreamId, stream: Pubky[] = []): UserStreamModelSchema => {
  return {
    id,
    stream,
  };
};
