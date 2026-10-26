import { PWA_STANDALONE_MEDIA_QUERY } from '@/config/pwa';

/** True when the page runs as an installed app (standalone / minimal-ui, or iOS Home Screen). */
export function isStandaloneDisplayMode(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.navigator.standalone === true) return true;
  // jsdom has no matchMedia; treat it as a normal browser tab.
  if (typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(PWA_STANDALONE_MEDIA_QUERY).matches;
}

/**
 * iPhone, iPod and iPad, including iPadOS which reports itself as a Mac with touch
 * points. Safari on iOS never fires `beforeinstallprompt`, so installing means
 * following manual Add-to-Home-Screen steps.
 */
export function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const { userAgent, platform, maxTouchPoints } = navigator;
  return /iPad|iPhone|iPod/.test(userAgent) || (platform === 'MacIntel' && maxTouchPoints > 1);
}

/**
 * Android browser where an `intent://` deep link can name a specific app package.
 * Firefox for Android (`Firefox/` in the user agent) is excluded because its `intent://`
 * handling is less reliable, so callers fall back to the plain scheme. Chrome's "Desktop site"
 * mode drops `Android` from the user agent, so it also falls back to the plain scheme.
 */
export function isAndroidIntentDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const { userAgent } = navigator;
  return /Android/i.test(userAgent) && !/Firefox\//.test(userAgent);
}

export function isAppBadgeSupported(): boolean {
  return typeof navigator !== 'undefined' && 'setAppBadge' in navigator && 'clearAppBadge' in navigator;
}
