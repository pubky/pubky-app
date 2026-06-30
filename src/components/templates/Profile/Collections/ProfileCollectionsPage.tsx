import { TIMELINE_FEED_VARIANT } from '@/config/feed';
import { TimelineFeed } from '@/organisms/Timeline/Feed/TimelineFeed/TimelineFeed';

/**
 * ProfileCollectionsPage Template
 *
 * Template for the profile Collections tab. Renders the viewed author's
 * collection posts via TimelineFeed (`PROFILE_COLLECTIONS` → `<pubky>:author:collection`).
 */
export function ProfileCollectionsPage() {
  return <TimelineFeed variant={TIMELINE_FEED_VARIANT.PROFILE_COLLECTIONS} />;
}
