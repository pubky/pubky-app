import type { TFollowParams } from '@/controllers/user/user.type';
import { HttpMethod } from '@/libs/http/http.types';
import type { UserCountsModel } from '@/models/user/counts/userCounts';
import type { FollowMutationResult } from '@/services/local/follow/follow.types';
import type { NexusUserCounts } from '@/services/nexus/nexus.types';

/** Cached Dexie row (includes `id`) or Nexus API payload (counters only). */
export type TUserCountsOrFetchResult = UserCountsModel | NexusUserCounts;

export type TUserApplicationFollowParams = TFollowParams & {
  eventType: HttpMethod;
  followUrl: string;
  followJson: Record<string, unknown>;
};

export type TUserApplicationFollowResult = FollowMutationResult;
