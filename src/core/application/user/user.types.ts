import type { TFollowParams } from '@/controllers/user/user.type';
import { HttpMethod } from '@/libs/http/http.types';
import type { Pubky } from '@/models/models.types';
import type { UserCountsModel } from '@/models/user/counts/userCounts';
import type { NexusSocialGraphStatus, NexusUserCounts } from '@/services/nexus/nexus.types';

/** Cached Dexie row (includes `id`) or Nexus API payload (counters only). */
export type TUserCountsOrFetchResult = UserCountsModel | NexusUserCounts;

/**
 * Local read of a user's social graph badge tier.
 *
 * Wrapped in an object so a cached "no ranking" (`{ status: null }`) stays distinct
 * from a cache miss (`null`) for local-first consumers, which fetch on `null` only.
 */
export type TUserSocialGraphStatusResult = {
  status: NexusSocialGraphStatus | null;
};

export type TUserApplicationFollowParams = TFollowParams & {
  eventType: HttpMethod;
  followUrl: string;
  followJson: Record<string, unknown>;
  signal?: AbortSignal;
};

export type TEnsureModerationFollowParams = {
  follower: Pubky;
  moderationId?: Pubky;
  /** Bot already processed for this account, from settings. */
  moderationBot?: Pubky;
  signal?: AbortSignal;
};
