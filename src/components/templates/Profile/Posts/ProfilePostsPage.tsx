import { TimelineFeed } from '@/organisms/Timeline/Feed/TimelineFeed/TimelineFeed';

import { TIMELINE_FEED_VARIANT } from '@/config/feed';

/**
 * ProfilePostsPage Template
 *
 * Template for displaying the current user's posts.
 * Delegates all logic to the ProfilePosts organism.
 */
export function ProfilePostsPage() {
  return <TimelineFeed variant={TIMELINE_FEED_VARIANT.PROFILE} />;
}
