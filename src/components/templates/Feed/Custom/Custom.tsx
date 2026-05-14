import { TIMELINE_FEED_VARIANT } from '@/config/feed';
import { AlertBackup } from '@/organisms/AlertBackup/AlertBackup';
import { ContentLayout } from '@/organisms/ContentLayout/ContentLayout';
import { CustomFeedFilters } from '@/organisms/CustomFeedFilters/CustomFeedFilters';
import { FeedNavigation } from '@/organisms/FeedNavigation/FeedNavigation';
import { HomeFeedRightDrawer, HomeFeedRightSidebar } from '@/organisms/FeedRightSidebar/FeedRightSidebar';
import { PostInput } from '@/organisms/PostInput/PostInput';
import { POST_INPUT_VARIANT } from '@/organisms/PostInput/PostInput.constants';
import { TimelineFeed } from '@/organisms/Timeline/Feed/TimelineFeed/TimelineFeed';

export function Custom() {
  return (
    <>
      <ContentLayout
        feedVariant={TIMELINE_FEED_VARIANT.CUSTOM}
        leftSidebarContent={<CustomFeedFilters variant="sidebar" />}
        rightSidebarContent={<HomeFeedRightSidebar />}
        leftDrawerContent={<CustomFeedFilters variant="drawer" />}
        rightDrawerContent={<HomeFeedRightDrawer />}
        leftDrawerContentMobile={<CustomFeedFilters variant="drawer" />}
        rightDrawerContentMobile={<FeedNavigation className="lg:hidden" />}
      >
        <AlertBackup />
        <FeedNavigation className="hidden lg:flex" />
        <TimelineFeed variant={TIMELINE_FEED_VARIANT.CUSTOM}>
          <PostInput variant={POST_INPUT_VARIANT.POST} />
        </TimelineFeed>
      </ContentLayout>
    </>
  );
}
