import type { Pubky } from '@/models/models.types';
import type { UserStreamCompositeReach } from '@/services/nexus/nexus.types';

// User Stream ID Pattern: source:timeframe:reach
// - SOURCE: followers, following, friends, muted, most_followed, influencers, recommended, post_replies, wot
// - TIMEFRAME: today, this_week, this_month, all_time, all
// - REACH (Supported in 'influencers' source): followers, following, friends, wot (u8), all
//
// Starter pack IDs extend the pattern with a 4th ordered-tag segment: source:timeframe:reach:tag1,tag2
// - SOURCE: starter_pack (pubky/pubky-nexus#1024)
// - Tag order matters: Nexus interleaves per-tag rankings in the order given.
//
// Note: Different from PostStreamTypes pattern (sorting:source:kind) to optimize for user-centric queries
export enum UserStreamTypes {
  // Bootstrap default lists:
  // Active users in the UI. We get randomly, preview=true param active in nexus
  TODAY_INFLUENCERS_ALL = 'influencers:today:all',
  MOST_FOLLOWED = 'most_followed:all:all',
  RECOMMENDED = 'recommended:all:all',
  MUTED = 'muted',
  // TODO: Add all possible cases
}

// Nexus stream source for starter packs (pubky/pubky-nexus#1024)
export const STARTER_PACK_STREAM_SOURCE = 'starter_pack' as const;

// Starter pack ID format: source:all:all:tag1,tag2 (ordered, canonicalized tags)
export type StarterPackStreamId = `${typeof STARTER_PACK_STREAM_SOURCE}:all:all:${string}`;

// Composite ID format: userId:reach (e.g., 'user123:followers')
export type UserStreamCompositeId = `${Pubky}:${UserStreamCompositeReach}`;

export type UserStreamId = UserStreamTypes | UserStreamCompositeId | StarterPackStreamId;
