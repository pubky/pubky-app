import type { Pubky } from '@/models/models.types';
import type { UserStreamCompositeReach } from '@/services/nexus/nexus.types';

// User Stream ID Pattern: source:timeframe:reach
// - SOURCE: followers, following, friends, muted, most_followed, influencers, recommended, post_replies, wot
// - TIMEFRAME: today, this_week, this_month, all_time, all
// - REACH (Supported in 'influencers' source): followers, following, friends, wot (u8), all
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

// Composite ID format: userId:reach (e.g., 'user123:followers')
export type UserStreamCompositeId = `${Pubky}:${UserStreamCompositeReach}`;

export type UserStreamId = UserStreamTypes | UserStreamCompositeId;
