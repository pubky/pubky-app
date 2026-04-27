import * as Core from '@/core';
import { HttpMethod } from '@/libs/http/http.types';

/** Cached Dexie row (includes `id`) or Nexus API payload (counters only). */
export type TUserCountsOrFetchResult = Core.UserCountsModel | Core.NexusUserCounts;

export type TUserApplicationFollowParams = Core.TFollowParams & {
  eventType: HttpMethod;
  followUrl: string;
  followJson: Record<string, unknown>;
  activeStreamId?: Core.PostStreamTypes | null;
};
