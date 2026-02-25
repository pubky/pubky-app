import * as Organisms from '@/organisms';
import { POST_INPUT_VARIANT } from '@/organisms/PostInput/PostInput.constants';
import { TIMELINE_FEED_VARIANT } from '@/organisms/TimelineFeed/TimelineFeed.types';

export function Custom() {
  return (
    <>
      <Organisms.ContentLayout
        showRightMobileButton={false}
        leftSidebarContent={<Organisms.CustomFeedFilters variant="sidebar" />}
        rightSidebarContent={<Organisms.HomeFeedRightSidebar />}
        leftDrawerContent={<Organisms.CustomFeedFilters variant="drawer" />}
        rightDrawerContent={<Organisms.HomeFeedRightDrawer />}
        leftDrawerContentMobile={<Organisms.CustomFeedFilters variant="drawer" />}
      >
        <Organisms.AlertBackup />
        <Organisms.FeedNavigation />
        <Organisms.TimelineFeed variant={TIMELINE_FEED_VARIANT.CUSTOM}>
          <Organisms.PostInput variant={POST_INPUT_VARIANT.POST} />
        </Organisms.TimelineFeed>
      </Organisms.ContentLayout>
    </>
  );
}
