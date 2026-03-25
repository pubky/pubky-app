import * as Organisms from '@/organisms';
import { TIMELINE_FEED_VARIANT } from '@/config';
import { POST_INPUT_VARIANT } from '@/organisms/PostInput/PostInput.constants';

export function Home() {
  return (
    <>
      <Organisms.DialogWelcome />
      <Organisms.ContentLayout
        feedVariant={TIMELINE_FEED_VARIANT.HOME}
        leftSidebarContent={<Organisms.HomeFeedSidebar allowVisualLayout feedVariant={TIMELINE_FEED_VARIANT.HOME} />}
        rightSidebarContent={<Organisms.HomeFeedRightSidebar />}
        leftDrawerContent={<Organisms.HomeFeedDrawer allowVisualLayout feedVariant={TIMELINE_FEED_VARIANT.HOME} />}
        rightDrawerContent={<Organisms.HomeFeedRightDrawer />}
        leftDrawerContentMobile={
          <Organisms.HomeFeedDrawerMobile allowVisualLayout feedVariant={TIMELINE_FEED_VARIANT.HOME} />
        }
        rightDrawerContentMobile={<Organisms.FeedNavigation className="lg:hidden" />}
      >
        <Organisms.AlertBackup />
        <Organisms.FeedNavigation className="hidden lg:flex" />
        <Organisms.TimelineFeed variant={TIMELINE_FEED_VARIANT.HOME}>
          <Organisms.PostInput dataCy="home-post-input" variant={POST_INPUT_VARIANT.POST} />
        </Organisms.TimelineFeed>
      </Organisms.ContentLayout>
    </>
  );
}
