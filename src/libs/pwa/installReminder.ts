import { z } from 'zod';
import { buildFeatureDiscoveryStorageKey } from '@/config/featureDiscovery';
import { PWA_INSTALL_REMINDER_DELAYS_MS, PWA_INSTALL_STORAGE_ID } from '@/config/pwa';

/**
 * Per-user snooze state for the "Install Pubky" banner, kept in localStorage under
 * the feature-discovery namespace (same storage pattern as `useCollectionsNavDiscovery`).
 *
 * "Later" snoozes with escalating delays; installing (or confirming the iOS steps)
 * dismisses the banner permanently. Storage failures never throw: an unreadable
 * store hides the banner and is never written to, and an unwritable one still
 * dismisses the banner for this session because the last value written is kept
 * in memory and preferred over an empty store.
 */

const reminderSchema = z.object({
  done: z.boolean(),
  laterCount: z.number().int().nonnegative(),
  nextShowAt: z.number().nonnegative(),
});

type InstallReminder = z.infer<typeof reminderSchema>;

const initialReminder: InstallReminder = { done: false, laterCount: 0, nextShowAt: 0 };
const dismissalListeners = new Set<(pubky: string) => void>();
// Values localStorage refused to persist, per user: the source of truth for this tab until a
// later write succeeds or another tab writes (see the `storage` listener below).
const unsavedWrites = new Map<string, InstallReminder>();

// exported for integration tests
export function resetInstallReminderMemory() {
  unsavedWrites.clear();
}

function storageKey(pubky: string): string {
  return buildFeatureDiscoveryStorageKey(pubky, PWA_INSTALL_STORAGE_ID);
}

function readReminder(pubky: string): InstallReminder {
  const unsaved = unsavedWrites.get(pubky);
  if (unsaved) return unsaved;
  const raw = window.localStorage.getItem(storageKey(pubky));
  if (!raw) return initialReminder;
  try {
    return reminderSchema.safeParse(JSON.parse(raw)).data ?? initialReminder;
  } catch {
    return initialReminder;
  }
}

function notifyDismissal(pubky: string) {
  for (const listener of dismissalListeners) listener(pubky);
}

function writeReminder(pubky: string, next: InstallReminder) {
  try {
    window.localStorage.setItem(storageKey(pubky), JSON.stringify(next));
    unsavedWrites.delete(pubky);
  } catch {
    // Keep the value for this session so re-checks do not resurrect a dismissed banner.
    unsavedWrites.set(pubky, next);
  }
  notifyDismissal(pubky);
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
  let previous: InstallReminder;
  try {
    previous = readReminder(pubky);
  } catch {
    // The stored schedule (possibly a permanent dismissal) could not be read, so it must not
    // be overwritten; the banner still hides for this session.
    notifyDismissal(pubky);
    return;
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
    if (event.key !== storageKey(pubky) && event.key !== null) return;
    // Another tab owns the latest value now.
    unsavedWrites.delete(pubky);
    if (!isInstallReminderDue(pubky)) onDismiss();
  };
  dismissalListeners.add(onLocalDismissal);
  window.addEventListener('storage', onStorage);
  return () => {
    dismissalListeners.delete(onLocalDismissal);
    window.removeEventListener('storage', onStorage);
  };
}
