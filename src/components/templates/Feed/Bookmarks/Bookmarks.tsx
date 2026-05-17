import { TIMELINE_FEED_VARIANT } from '@/config/feed';
import { TimelineFeed } from '@/organisms/Timeline/Feed/TimelineFeed/TimelineFeed';

/**
 * Bookmarks Page Template
 *
 * Displays the user's bookmarked posts with filtering capabilities.
 * Reuses the same sidebar components from Home page for UI consistency.
 *
 * Sort and Content filters affect the bookmarks stream.
 * Reach filter is hidden as it's not supported by the Nexus API for bookmarks.
 *
 * Rendered as `{children}` inside the shared `(feeds)/layout.tsx`, which hoists
 * the `ContentLayout` shell (sidebars, drawers, right rail) across the feed
 * cluster so it stays mounted across intra-cluster transitions. The shell
 * config for `/bookmarks` lives in `app/(feeds)/_shell/configs.tsx`.
 */
export function Bookmarks() {
  return <TimelineFeed variant={TIMELINE_FEED_VARIANT.BOOKMARKS} />;
}
