import { TIMELINE_FEED_VARIANT } from '@/config/feed';
import { ContentLayout } from '@/organisms/ContentLayout/ContentLayout';
import { HomeFeedRightDrawer, HomeFeedRightSidebar } from '@/organisms/FeedRightSidebar/FeedRightSidebar';
import { HomeFeedDrawer, HomeFeedDrawerMobile, HomeFeedSidebar } from '@/organisms/HomeFeedSidebar/HomeFeedSidebar';
import { TimelineFeed } from '@/organisms/Timeline/Feed/TimelineFeed/TimelineFeed';

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
    <ContentLayout
      feedVariant={TIMELINE_FEED_VARIANT.BOOKMARKS}
      showRightMobileButton={false}
      leftSidebarContent={
        <HomeFeedSidebar hideReachFilter allowVisualLayout feedVariant={TIMELINE_FEED_VARIANT.BOOKMARKS} />
      }
      rightSidebarContent={<HomeFeedRightSidebar />}
      leftDrawerContent={
        <HomeFeedDrawer hideReachFilter allowVisualLayout feedVariant={TIMELINE_FEED_VARIANT.BOOKMARKS} />
      }
      rightDrawerContent={<HomeFeedRightDrawer />}
      leftDrawerContentMobile={
        <HomeFeedDrawerMobile hideReachFilter allowVisualLayout feedVariant={TIMELINE_FEED_VARIANT.BOOKMARKS} />
      }
    >
      <TimelineFeed variant={TIMELINE_FEED_VARIANT.BOOKMARKS} />
    </ContentLayout>
  );
}
