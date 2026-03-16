import * as Organisms from '@/organisms';
import { POST_INPUT_VARIANT } from '@/organisms/PostInput/PostInput.constants';
import { TIMELINE_FEED_VARIANT } from '@/organisms/Timeline/Feed/TimelineFeed/TimelineFeed.types';

export function Custom() {
  return (
    <>
      <Organisms.ContentLayout
        leftSidebarContent={<Organisms.CustomFeedFilters variant="sidebar" />}
        rightSidebarContent={<Organisms.HomeFeedRightSidebar />}
        leftDrawerContent={<Organisms.CustomFeedFilters variant="drawer" />}
        rightDrawerContent={<Organisms.HomeFeedRightDrawer />}
        leftDrawerContentMobile={<Organisms.CustomFeedFilters variant="drawer" />}
        rightDrawerContentMobile={<Organisms.FeedNavigation className="lg:hidden" />}
      >
        <Organisms.AlertBackup />
        <Organisms.FeedNavigation className="hidden lg:flex" />
        <Organisms.TimelineFeed variant={TIMELINE_FEED_VARIANT.CUSTOM}>
          <Organisms.PostInput variant={POST_INPUT_VARIANT.POST} />
        </Organisms.TimelineFeed>
      </Organisms.ContentLayout>
    </>
  );
}
