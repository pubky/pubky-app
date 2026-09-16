'use client';

import { useEffect, useSyncExternalStore } from 'react';
import {
  getInstallPromptSnapshot,
  getServerInstallPromptSnapshot,
  subscribeToInstallPrompt,
} from '@/libs/pwa/installPrompt';
import { markInstallReminderDone } from '@/libs/pwa/installReminder';
import { useAuthStore } from '@/stores/auth/auth.store';

/**
 * Mounted once (PwaManager) on every route. Importing it evaluates the
 * `beforeinstallprompt` capture early, and it retires the install banner for
 * good once the browser reports the app was installed.
 */
export function useInstallPromptLifecycle() {
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  const { installed } = useSyncExternalStore(
    subscribeToInstallPrompt,
    getInstallPromptSnapshot,
    getServerInstallPromptSnapshot,
  );

  useEffect(() => {
    if (installed && currentUserPubky) markInstallReminderDone(currentUserPubky);
  }, [installed, currentUserPubky]);
}
