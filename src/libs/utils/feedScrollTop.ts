import type React from 'react';
import { FORCE_FEED_SCROLL_TOP_KEY } from '@/config/feed';

interface HandleFeedNavClickOptions {
  /** Whether the clicked nav target is the route the user is already on. */
  isActive: boolean;
  /** When already active, smooth-scroll to the top instead of navigating. */
  smoothScrollWhenActive?: boolean;
}

/**
 * Shared click handler for feed-cluster nav entry points (Pubky logo, desktop
 * header, mobile footer, feed navigation).
 *
 * The `(feeds)` layout is persistent across intra-cluster navigation
 * (`/home`, `/feed/[id]`, `/bookmarks`, `/search`), so the browser does not
 * reset `window.scrollY` when switching feeds — a new feed would otherwise
 * inherit (and clamp) the previous feed's offset. When navigating to a feed
 * the user is not already on, we set a one-shot flag that
 * `(feeds)/layout.tsx` consumes to scroll to the top on arrival.
 *
 * Modified clicks (new tab/window) are left untouched. When already on the
 * target route, optionally smooth-scroll to the top instead of navigating.
 * Browser back never goes through here, so native history scroll restoration
 * is preserved.
 */
export function handleFeedNavClick(
  event: React.MouseEvent,
  { isActive, smoothScrollWhenActive }: HandleFeedNavClickOptions,
): void {
  // Don't hijack modified clicks (new tab/window, etc.)
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;

  if (isActive) {
    if (smoothScrollWhenActive) {
      event.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    // Already on this feed: never set the flag.
    return;
  }

  try {
    window.sessionStorage.setItem(FORCE_FEED_SCROLL_TOP_KEY, '1');
  } catch {
    // Ignore storage errors and keep default navigation behavior.
  }
}
