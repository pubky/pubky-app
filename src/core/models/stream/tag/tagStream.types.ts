// Tag Stream ID Pattern: timeframe:reach
// TIMEFRAME: today, this_month, all_time
// REACH (Supported in 'influencers' source): followers, following, friends, wot (u8)
//
// Note: Different from TagStreamTypes pattern (timeframe:reach) to optimize for tag-centric queries
export enum TagStreamTypes {
  // Bootstrap default lists:
  TODAY_ALL = 'today:all',
  // Other lists, persisted after user navigation
  ALL = 'all:all',
  THIS_MONTH_ALL = 'month:all',
}
