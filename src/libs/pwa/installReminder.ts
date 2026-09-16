import { z } from 'zod';
import { buildFeatureDiscoveryStorageKey } from '@/config/featureDiscovery';
import { PWA_INSTALL_REMINDER_DELAYS_MS, PWA_INSTALL_STORAGE_ID } from '@/config/pwa';

/**
 * Per-user snooze state for the "Install Pubky" banner, kept in localStorage under
 * the feature-discovery namespace (same storage pattern as `useCollectionsNavDiscovery`).
 *
 * "Later" snoozes with escalating delays; installing (or confirming the iOS steps)
 * dismisses the banner permanently. Storage failures never throw: an unreadable
 * store hides the banner, an unwritable one still dismisses it for this session.
 */

const reminderSchema = z.object({
  done: z.boolean(),
  laterCount: z.number().int().nonnegative(),
  nextShowAt: z.number().nonnegative(),
});

type InstallReminder = z.infer<typeof reminderSchema>;

const initialReminder: InstallReminder = { done: false, laterCount: 0, nextShowAt: 0 };
const dismissalListeners = new Set<(pubky: string) => void>();

function storageKey(pubky: string): string {
  return buildFeatureDiscoveryStorageKey(pubky, PWA_INSTALL_STORAGE_ID);
}

function readReminder(pubky: string): InstallReminder {
  const raw = window.localStorage.getItem(storageKey(pubky));
  if (!raw) return initialReminder;
  try {
    return reminderSchema.safeParse(JSON.parse(raw)).data ?? initialReminder;
  } catch {
    return initialReminder;
  }
}

function writeReminder(pubky: string, next: InstallReminder) {
  try {
    window.localStorage.setItem(storageKey(pubky), JSON.stringify(next));
  } catch {
    // The in-memory dismissal below still hides mounted banners for this session.
  }
  for (const listener of dismissalListeners) listener(pubky);
}

export function isInstallReminderDue(pubky: string): boolean {
  try {
    const reminder = readReminder(pubky);
    return !reminder.done && Date.now() >= reminder.nextShowAt;
  } catch {
    // Do not prompt when browser storage cannot be read.
    return false;
  }
}

/** Permanent dismissal: the app was installed or the user confirmed the manual steps. */
export function markInstallReminderDone(pubky: string) {
  writeReminder(pubky, { ...initialReminder, done: true });
}

/** "Later": hide for the next delay in the schedule; the last delay repeats. */
export function snoozeInstallReminder(pubky: string) {
  let previous = initialReminder;
  try {
    previous = readReminder(pubky);
  } catch {
    // Fall through with the initial schedule.
  }
  if (previous.done) return;
  const step = Math.min(previous.laterCount, PWA_INSTALL_REMINDER_DELAYS_MS.length - 1);
  writeReminder(pubky, {
    done: false,
    laterCount: Math.min(step + 1, PWA_INSTALL_REMINDER_DELAYS_MS.length - 1),
    nextShowAt: Date.now() + PWA_INSTALL_REMINDER_DELAYS_MS[step],
  });
}

/** Hides the banner immediately in every mounted instance and in other tabs; eligibility is only re-checked on a visit. */
export function subscribeToInstallReminderDismissal(pubky: string, onDismiss: () => void): () => void {
  const onLocalDismissal = (dismissedPubky: string) => {
    if (dismissedPubky === pubky) onDismiss();
  };
  const onStorage = (event: StorageEvent) => {
    if ((event.key === storageKey(pubky) || event.key === null) && !isInstallReminderDue(pubky)) onDismiss();
  };
  dismissalListeners.add(onLocalDismissal);
  window.addEventListener('storage', onStorage);
  return () => {
    dismissalListeners.delete(onLocalDismissal);
    window.removeEventListener('storage', onStorage);
  };
}
