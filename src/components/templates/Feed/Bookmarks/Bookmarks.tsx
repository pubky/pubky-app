import * as Organisms from '@/organisms';
import { TIMELINE_FEED_VARIANT } from '@/organisms/TimelineFeed/TimelineFeed.types';

/**
 * Bookmarks Page Template
 *
 * Displays the user's bookmarked posts with filtering capabilities.
 * Reuses the same sidebar components from Home page for UI consistency.
 *
 * Sort and Content filters affect the bookmarks stream.
 * Reach filter is hidden as it's not supported by the Nexus API for bookmarks.
 */
export function Bookmarks() {
  return (
    <Organisms.ContentLayout
      showRightMobileButton={false}
      leftSidebarContent={<Organisms.HomeFeedSidebar hideReachFilter />}
      rightSidebarContent={<Organisms.HomeFeedRightSidebar />}
      leftDrawerContent={<Organisms.HomeFeedDrawer hideReachFilter />}
      rightDrawerContent={<Organisms.HomeFeedRightDrawer />}
      leftDrawerContentMobile={<Organisms.HomeFeedDrawerMobile hideReachFilter />}
    >
      <Organisms.TimelineFeed variant={TIMELINE_FEED_VARIANT.BOOKMARKS} />
    </Organisms.ContentLayout>
  );
}
