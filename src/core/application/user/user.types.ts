import type { TReadProfileParams } from '@/controllers/profile/profile.types';
import type { TFollowParams } from '@/controllers/user/user.type';
import { HttpMethod } from '@/libs/http/http.types';
import type { Pubky } from '@/models/models.types';
import type { UserCountsModel } from '@/models/user/counts/userCounts';
import type { NexusUserCounts } from '@/services/nexus/nexus.types';

/** Cached Dexie row (includes `id`) or Nexus API payload (counters only). */
export type TUserCountsOrFetchResult = UserCountsModel | NexusUserCounts;

/** Target user plus the signed-in viewer (null for guests) so the persisted relationship is viewer-relative. */
export type TUserApplicationFetchParams = TReadProfileParams & {
  viewerId?: Pubky | null;
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
