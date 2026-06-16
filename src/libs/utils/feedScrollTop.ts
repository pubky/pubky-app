import type React from 'react';
import { FORCE_FEED_SCROLL_TOP_KEY } from '@/config/feed';

// Accessing `window.sessionStorage` can throw (e.g. sandboxed iframes, storage
// blocked by privacy settings) — even on the property read, not just on
// set/get. These helpers keep every access safe so scroll handling never breaks.

/** Set the one-shot "scroll the next feed to the top" intent flag. */
export function markFeedScrollTop(): void {
  try {
    window.sessionStorage.setItem(FORCE_FEED_SCROLL_TOP_KEY, '1');
  } catch {
    // Ignore storage errors and keep default navigation behavior.
  }
}

/** Read and clear the flag in one step; returns whether it was set. */
export function consumeFeedScrollTop(): boolean {
  try {
    if (window.sessionStorage.getItem(FORCE_FEED_SCROLL_TOP_KEY) !== '1') return false;
    window.sessionStorage.removeItem(FORCE_FEED_SCROLL_TOP_KEY);
    return true;
  } catch {
    return false;
  }
}

/** Clear the flag (used when a same-route restore supersedes the top-scroll intent). */
export function clearFeedScrollTop(): void {
  try {
    window.sessionStorage.removeItem(FORCE_FEED_SCROLL_TOP_KEY);
  } catch {
    // Ignore storage errors.
  }
}

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

  markFeedScrollTop();
}
