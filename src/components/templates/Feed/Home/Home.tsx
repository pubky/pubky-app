'use client';
import { TIMELINE_FEED_VARIANT } from '@/config/feed';
import { AlertBackup } from '@/organisms/AlertBackup/AlertBackup';
import { DialogWelcome } from '@/organisms/DialogWelcome/DialogWelcome';
import { FeedNavigation } from '@/organisms/FeedNavigation/FeedNavigation';
import { PostInput } from '@/organisms/PostInput/PostInput';
import { POST_INPUT_VARIANT } from '@/organisms/PostInput/PostInput.constants';
import { TimelineFeed } from '@/organisms/Timeline/Feed/TimelineFeed/TimelineFeed';

/**
 * Forward-navigation top-scroll (the `FORCE_FEED_SCROLL_TOP_KEY` flag) is set by
 * feed nav entry points and consumed centrally in `(feeds)/layout.tsx`, which
 * is the single owner of feed scroll positioning across the persistent layout.
 */
export function Home() {
  return (
    <>
      <DialogWelcome />
      <AlertBackup />
      <FeedNavigation className="hidden lg:flex" />
      <TimelineFeed variant={TIMELINE_FEED_VARIANT.HOME}>
        <PostInput dataCy="home-post-input" variant={POST_INPUT_VARIANT.POST} />
      </TimelineFeed>
    </>
  );
}
