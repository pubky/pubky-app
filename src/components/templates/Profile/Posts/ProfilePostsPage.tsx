import * as Organisms from '@/organisms';
import { TIMELINE_FEED_VARIANT } from '@/config';

/**
 * ProfilePostsPage Template
 *
 * Template for displaying the current user's posts.
 * Delegates all logic to the ProfilePosts organism.
 */
export function ProfilePostsPage() {
  return <Organisms.TimelineFeed variant={TIMELINE_FEED_VARIANT.PROFILE} />;
}
