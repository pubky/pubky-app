/**
 * Browser APIs used by the PWA layer that TypeScript's `lib.dom` does not declare.
 * `Navigator.setAppBadge` / `clearAppBadge` / `share` / `canShare` are already typed.
 */

/** Chromium-only event captured to show the install banner on our own terms. */
export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

declare global {
  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent;
    appinstalled: Event;
  }

  interface Navigator {
    /** iOS Safari only: `true` when the page was launched from the Home Screen. */
    readonly standalone?: boolean;
  }
}

export type InstallPromptOutcome = 'accepted' | 'dismissed' | 'unavailable';

/** `native` uses the captured `beforeinstallprompt`; `ios` shows manual Add-to-Home-Screen steps. */
export type InstallPlatform = 'native' | 'ios';
