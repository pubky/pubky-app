import type { InstallPlatform } from '@/libs/pwa/pwa.types';

export interface UseInstallPromptResult {
  /** The banner should render. */
  visible: boolean;
  /** How "Install" behaves; `null` when this browser cannot install. */
  platform: InstallPlatform | null;
  /** Native: shows the browser prompt. iOS: opens the manual-steps dialog. */
  install: () => Promise<void>;
  /** "Later": snooze with the escalating schedule. */
  remindLater: () => void;
  iosDialogOpen: boolean;
  /** `confirmed` = the user tapped "Got it" (permanent); otherwise the dialog was closed (snooze). */
  closeIosDialog: (confirmed: boolean) => void;
}
