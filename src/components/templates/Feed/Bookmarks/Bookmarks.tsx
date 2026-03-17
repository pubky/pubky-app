import { TIMELINE_FEED_VARIANT } from '@/config';
import * as Organisms from '@/organisms';

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
      feedVariant={TIMELINE_FEED_VARIANT.BOOKMARKS}
      showRightMobileButton={false}
      leftSidebarContent={
        <Organisms.HomeFeedSidebar hideReachFilter allowVisualLayout feedVariant={TIMELINE_FEED_VARIANT.BOOKMARKS} />
      }
      rightSidebarContent={<Organisms.HomeFeedRightSidebar />}
      leftDrawerContent={
        <Organisms.HomeFeedDrawer hideReachFilter allowVisualLayout feedVariant={TIMELINE_FEED_VARIANT.BOOKMARKS} />
      }
      rightDrawerContent={<Organisms.HomeFeedRightDrawer />}
      leftDrawerContentMobile={
        <Organisms.HomeFeedDrawerMobile
          hideReachFilter
          allowVisualLayout
          feedVariant={TIMELINE_FEED_VARIANT.BOOKMARKS}
        />
      }
    >
      <Organisms.TimelineFeed variant={TIMELINE_FEED_VARIANT.BOOKMARKS} />
    </Organisms.ContentLayout>
  );
}
