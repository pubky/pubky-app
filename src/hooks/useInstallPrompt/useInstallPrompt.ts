'use client';

import { useState, useSyncExternalStore } from 'react';
import { PWA_INSTALL_BANNER_ENABLED } from '@/config/pwa';
import { useFeatureReminderDue } from '@/hooks/useFeatureReminderDue/useFeatureReminderDue';
import { useIsStandalone } from '@/hooks/useIsStandalone/useIsStandalone';
import {
  getInstallPromptSnapshot,
  getServerInstallPromptSnapshot,
  promptInstall,
  subscribeToInstallPrompt,
} from '@/libs/pwa/installPrompt';
import { installReminder } from '@/libs/pwa/installReminder';
import { isIosDevice } from '@/libs/pwa/platform';
import type { InstallPlatform } from '@/libs/pwa/pwa.types';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useOnboardingStore } from '@/stores/onboarding/onboarding.store';
import type { UseInstallPromptResult } from './useInstallPrompt.types';

const noopSubscribe = () => () => undefined;
const getServerIsIos = () => false;

/**
 * Eligibility and actions for the "Install Pubky" banner.
 *
 * Shown to signed-in users browsing in a tab (not installed), once the browser can
 * install (Chromium captured `beforeinstallprompt`, or iOS Safari where the steps
 * are manual), while no backup reminder is pending, and only when the snooze is
 * due. Eligibility is re-checked on a visit or on returning to the tab, never on
 * a timer.
 */
export function useInstallPrompt(): UseInstallPromptResult {
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  const hasPendingBackup = useOnboardingStore((state) => Boolean(state.secretKey));
  const isStandalone = useIsStandalone();
  const isIos = useSyncExternalStore(noopSubscribe, isIosDevice, getServerIsIos);
  const { canPrompt, installed } = useSyncExternalStore(
    subscribeToInstallPrompt,
    getInstallPromptSnapshot,
    getServerInstallPromptSnapshot,
  );
  const [iosDialogOpen, setIosDialogOpen] = useState(false);

  const platform: InstallPlatform | null = canPrompt ? 'native' : isIos ? 'ios' : null;
  // Only users who could actually see the banner pay for the storage re-check on every visit.
  const eligible = PWA_INSTALL_BANNER_ENABLED && !isStandalone && !installed && platform !== null;
  const due = useFeatureReminderDue(installReminder, currentUserPubky, eligible);
  const visible = eligible && !hasPendingBackup && due;

  const remindLater = () => {
    if (currentUserPubky && visible) installReminder.snooze(currentUserPubky);
  };

  const install = async () => {
    if (!visible || !currentUserPubky) return;
    if (platform === 'ios') {
      setIosDialogOpen(true);
      return;
    }
    // Called synchronously from the click so the native prompt keeps its user gesture.
    const outcome = await promptInstall();
    // Anything but an install counts as "later": a failed prompt must not re-nag on the next load.
    if (outcome === 'accepted') installReminder.markDone(currentUserPubky);
    else installReminder.snooze(currentUserPubky);
  };

  const closeIosDialog = (confirmed: boolean) => {
    setIosDialogOpen(false);
    if (!currentUserPubky) return;
    // iOS never fires `appinstalled`; "Got it" is the best signal we get.
    if (confirmed) installReminder.markDone(currentUserPubky);
    else installReminder.snooze(currentUserPubky);
  };

  return { visible, platform, install, remindLater, iosDialogOpen, closeIosDialog };
}
