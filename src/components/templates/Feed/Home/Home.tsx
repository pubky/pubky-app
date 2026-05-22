'use client';
import { useEffect } from 'react';
import { TIMELINE_FEED_VARIANT } from '@/config/feed';
import { AlertBackup } from '@/organisms/AlertBackup/AlertBackup';
import { DialogWelcome } from '@/organisms/DialogWelcome/DialogWelcome';
import { FeedNavigation } from '@/organisms/FeedNavigation/FeedNavigation';
import { PostInput } from '@/organisms/PostInput/PostInput';
import { POST_INPUT_VARIANT } from '@/organisms/PostInput/PostInput.constants';
import { TimelineFeed } from '@/organisms/Timeline/Feed/TimelineFeed/TimelineFeed';

/**
 * Session-storage flag set by callers (e.g. the home nav button) to force the
 * feed back to the top on the next `/home` mount. Read once on mount, then cleared.
 *
 * Lives here (not in `(feeds)/layout.tsx`) because the layout no longer remounts
 * on intra-cluster navigation, so it would never re-fire. `Home.tsx` is mounted
 * fresh whenever the user actually lands on `/home`, which is the right trigger.
 */
const FORCE_HOME_SCROLL_TOP_KEY = 'pubky:force-home-scroll-top';

export function Home() {
  useEffect(() => {
    if (window.sessionStorage.getItem(FORCE_HOME_SCROLL_TOP_KEY) !== '1') return;

    window.sessionStorage.removeItem(FORCE_HOME_SCROLL_TOP_KEY);
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: 'auto' });
    });
  }, []);

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
