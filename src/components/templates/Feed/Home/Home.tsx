import { TIMELINE_FEED_VARIANT } from '@/config/feed';
import { AlertBackup } from '@/organisms/AlertBackup/AlertBackup';
import { ContentLayout } from '@/organisms/ContentLayout/ContentLayout';
import { DialogWelcome } from '@/organisms/DialogWelcome/DialogWelcome';
import { FeedNavigation } from '@/organisms/FeedNavigation/FeedNavigation';
import { HomeFeedRightDrawer, HomeFeedRightSidebar } from '@/organisms/FeedRightSidebar/FeedRightSidebar';
import { HomeFeedDrawer, HomeFeedDrawerMobile, HomeFeedSidebar } from '@/organisms/HomeFeedSidebar/HomeFeedSidebar';
import { PostInput } from '@/organisms/PostInput/PostInput';
import { POST_INPUT_VARIANT } from '@/organisms/PostInput/PostInput.constants';
import { TimelineFeed } from '@/organisms/Timeline/Feed/TimelineFeed/TimelineFeed';

export function Home() {
  return (
    <>
      <DialogWelcome />
      <ContentLayout
        feedVariant={TIMELINE_FEED_VARIANT.HOME}
        leftSidebarContent={<HomeFeedSidebar allowVisualLayout feedVariant={TIMELINE_FEED_VARIANT.HOME} />}
        rightSidebarContent={<HomeFeedRightSidebar />}
        leftDrawerContent={<HomeFeedDrawer allowVisualLayout feedVariant={TIMELINE_FEED_VARIANT.HOME} />}
        rightDrawerContent={<HomeFeedRightDrawer />}
        leftDrawerContentMobile={<HomeFeedDrawerMobile allowVisualLayout feedVariant={TIMELINE_FEED_VARIANT.HOME} />}
        rightDrawerContentMobile={<FeedNavigation className="lg:hidden" />}
      >
        <AlertBackup />
        <FeedNavigation className="hidden lg:flex" />
        <TimelineFeed variant={TIMELINE_FEED_VARIANT.HOME}>
          <PostInput dataCy="home-post-input" variant={POST_INPUT_VARIANT.POST} />
        </TimelineFeed>
      </ContentLayout>
    </>
  );
}
