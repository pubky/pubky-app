import { z } from 'zod';
import { buildFeatureDiscoveryStorageKey } from '@/config/featureDiscovery';

const VIBES_ALERT_STORAGE_ID = 'vibes-alert-v1';
const VIBES_REMINDER_DELAYS_MS = [24, 72, 168].map((hours) => hours * 60 * 60 * 1000);

const reminderSchema = z.object({
  tried: z.boolean(),
  laterCount: z.number().int().nonnegative(),
  nextShowAt: z.number().nonnegative(),
});

type Reminder = z.infer<typeof reminderSchema>;
const initialReminder: Reminder = { tried: false, laterCount: 0, nextShowAt: 0 };
const dismissalListeners = new Set<(pubky: string) => void>();

function storageKey(pubky: string) {
  return buildFeatureDiscoveryStorageKey(pubky, VIBES_ALERT_STORAGE_ID);
}

function triedStorageKey(pubky: string) {
  return `${storageKey(pubky)}:tried`;
}

function readReminder(pubky: string): Reminder {
  if (window.localStorage.getItem(triedStorageKey(pubky)) === 'true') return { ...initialReminder, tried: true };
  const raw = window.localStorage.getItem(storageKey(pubky));
  if (!raw) return initialReminder;
  try {
    return reminderSchema.safeParse(JSON.parse(raw)).data ?? initialReminder;
  } catch {
    return initialReminder;
  }
}

export function isReminderDue(pubky: string): boolean {
  try {
    const reminder = readReminder(pubky);
    return !reminder.tried && Date.now() >= reminder.nextShowAt;
  } catch {
    // Do not prompt when browser storage cannot be read.
    return false;
  }
}

function updateReminder(pubky: string, update: (previous: Reminder) => Reminder) {
  try {
    // Use the latest saved snooze when handling a previously rendered alert.
    const previous = readReminder(pubky);
    const next = update(previous);
    // A concurrent snooze cannot overwrite this separate permanent dismissal flag.
    if (next.tried) window.localStorage.setItem(triedStorageKey(pubky), 'true');
    if (next !== previous) window.localStorage.setItem(storageKey(pubky), JSON.stringify(next));
  } catch {
    // Still dismiss mounted alerts if saving becomes unavailable.
  }
  for (const listener of dismissalListeners) listener(pubky);
}

export function markTried(pubky: string) {
  updateReminder(pubky, (previous) => (previous.tried ? previous : { ...previous, tried: true }));
}

export function remindLater(pubky: string) {
  updateReminder(pubky, (previous) => {
    const now = Date.now();
    if (previous.tried || now < previous.nextShowAt) return previous;
    const step = Math.min(previous.laterCount, VIBES_REMINDER_DELAYS_MS.length - 1);
    return {
      tried: false,
      laterCount: Math.min(step + 1, VIBES_REMINDER_DELAYS_MS.length - 1),
      nextShowAt: now + VIBES_REMINDER_DELAYS_MS[step],
    };
  });
}

/** Dismiss immediately across components/tabs; eligibility is checked only on a visit. */
export function subscribeToDismissal(pubky: string, onDismiss: () => void): () => void {
  const onLocalDismissal = (dismissedPubky: string) => {
    if (dismissedPubky === pubky) onDismiss();
  };
  const onStorage = (event: StorageEvent) => {
    if (
      (event.key === storageKey(pubky) || event.key === triedStorageKey(pubky) || event.key === null) &&
      !isReminderDue(pubky)
    )
      onDismiss();
  };
  dismissalListeners.add(onLocalDismissal);
  window.addEventListener('storage', onStorage);
  return () => {
    dismissalListeners.delete(onLocalDismissal);
    window.removeEventListener('storage', onStorage);
  };
}
