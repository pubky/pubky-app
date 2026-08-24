import { TIMELINE_FEED_VARIANT } from '@/config/feed';
import { AlertBackup } from '@/organisms/AlertBackup/AlertBackup';
import { FeedNavigation } from '@/organisms/FeedNavigation/FeedNavigation';
import { PostInput } from '@/organisms/PostInput/PostInput';
import { POST_INPUT_VARIANT } from '@/organisms/PostInput/PostInput.constants';
import { TimelineFeed } from '@/organisms/Timeline/Feed/TimelineFeed/TimelineFeed';

/**
 * The `/feed/[id]` route's page body. Rendered as `{children}` inside the
 * shared `(feeds)/layout.tsx` `<ContentLayout>` — the sidebars, drawers, and
 * right-rail are now hoisted into that layout (see
 * `app/(feeds)/_shell/configs.tsx`'s `customFeed` entry), so this template
 * only renders the feed body.
 */
export function Custom() {
  return (
    <>
      {/* First child so the mobile tab bar sits directly under the compact header (Hot pattern). */}
      <FeedNavigation className="-mx-6 w-auto lg:mx-0 lg:w-full" />
      <AlertBackup />
      <TimelineFeed variant={TIMELINE_FEED_VARIANT.CUSTOM}>
        <PostInput variant={POST_INPUT_VARIANT.POST} />
      </TimelineFeed>
    </>
  );
}
