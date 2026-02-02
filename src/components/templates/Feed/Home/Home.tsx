import * as Organisms from '@/organisms';
import { POST_INPUT_VARIANT } from '@/organisms/PostInput/PostInput.constants';
import { TIMELINE_FEED_VARIANT } from '@/organisms/TimelineFeed/TimelineFeed.types';

export function Home() {
  return (
    <>
      <Organisms.DialogWelcome />
      <Organisms.ContentLayout
        showRightMobileButton={false}
        leftSidebarContent={<Organisms.HomeFeedSidebar />}
        rightSidebarContent={<Organisms.HomeFeedRightSidebar />}
        leftDrawerContent={<Organisms.HomeFeedDrawer />}
        rightDrawerContent={<Organisms.HomeFeedRightDrawer />}
        leftDrawerContentMobile={<Organisms.HomeFeedDrawerMobile />}
      >
        <Organisms.AlertBackup />
        <Organisms.TimelineFeed variant={TIMELINE_FEED_VARIANT.HOME}>
          <Organisms.PostInput dataCy="home-post-input" variant={POST_INPUT_VARIANT.POST} />
        </Organisms.TimelineFeed>
      </Organisms.ContentLayout>
    </>
  );
}
