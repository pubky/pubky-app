import { z } from 'zod';
import { buildFeatureDiscoveryStorageKey } from '@/config/featureDiscovery';

/**
 * Per-user snooze state for a feature-discovery prompt (the Home banners), kept in
 * localStorage under the feature-discovery namespace (per-user one-time UI state).
 *
 * "Later" snoozes with escalating delays (the last one repeats); `markDone` dismisses the
 * prompt permanently. Storage failures never throw: an unreadable store hides the prompt and
 * is never written to, and an unwritable one still dismisses it for this session because the
 * last value written is kept in memory and preferred over an empty store.
 */
export interface FeatureReminder {
  /** Whether the prompt may show on this visit. `false` when storage cannot be read. */
  isDue: (pubky: string) => boolean;
  /** Permanent dismissal; a concurrent snooze from another tab cannot undo it. */
  markDone: (pubky: string) => void;
  /** "Later": hide until the next delay in the schedule. A stale prompt never extends a running snooze. */
  snooze: (pubky: string) => void;
  /** Hides the prompt in every mounted instance and in other tabs; eligibility is only re-checked on a visit. */
  subscribeToDismissal: (pubky: string, onDismiss: () => void) => () => void;
  // exported for integration tests
  resetMemory: () => void;
}

const reminderSchema = z.object({
  done: z.boolean(),
  laterCount: z.number().int().nonnegative(),
  nextShowAt: z.number().nonnegative(),
});

type Reminder = z.infer<typeof reminderSchema>;

const initialReminder: Reminder = { done: false, laterCount: 0, nextShowAt: 0 };
const doneReminder: Reminder = { ...initialReminder, done: true };

export function createFeatureReminder(storageId: string, delaysMs: readonly number[]): FeatureReminder {
  const dismissalListeners = new Set<(pubky: string) => void>();
  // Values localStorage refused to persist, per user: the source of truth for this tab until a
  // later write succeeds or another tab writes (see the `storage` listener below).
  const unsavedWrites = new Map<string, Reminder>();

  const storageKey = (pubky: string) => buildFeatureDiscoveryStorageKey(pubky, storageId);
  // Written apart from the snooze record so a stale snooze write from another tab cannot undo it.
  const doneKey = (pubky: string) => `${storageKey(pubky)}:done`;

  function readReminder(pubky: string): Reminder {
    if (window.localStorage.getItem(doneKey(pubky)) === 'true') return doneReminder;
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

  function writeReminder(pubky: string, next: Reminder) {
    try {
      if (next.done) window.localStorage.setItem(doneKey(pubky), 'true');
      window.localStorage.setItem(storageKey(pubky), JSON.stringify(next));
      unsavedWrites.delete(pubky);
    } catch {
      // Keep the value for this session so re-checks do not resurrect a dismissed prompt.
      unsavedWrites.set(pubky, next);
    }
    notifyDismissal(pubky);
  }

  function isDue(pubky: string): boolean {
    try {
      const reminder = readReminder(pubky);
      return !reminder.done && Date.now() >= reminder.nextShowAt;
    } catch {
      // Do not prompt when browser storage cannot be read.
      return false;
    }
  }

  return {
    isDue,
    markDone: (pubky) => writeReminder(pubky, doneReminder),
    snooze: (pubky) => {
      let previous: Reminder;
      try {
        previous = readReminder(pubky);
      } catch {
        // The stored schedule (possibly a permanent dismissal) could not be read, so it must not
        // be overwritten; the prompt still hides for this session.
        notifyDismissal(pubky);
        return;
      }
      // Already dismissed or snoozed (e.g. from another tab): only hide this stale prompt.
      if (previous.done || Date.now() < previous.nextShowAt) {
        notifyDismissal(pubky);
        return;
      }
      const step = Math.min(previous.laterCount, delaysMs.length - 1);
      writeReminder(pubky, {
        done: false,
        laterCount: Math.min(step + 1, delaysMs.length - 1),
        nextShowAt: Date.now() + delaysMs[step],
      });
    },
    subscribeToDismissal: (pubky, onDismiss) => {
      const onLocalDismissal = (dismissedPubky: string) => {
        if (dismissedPubky === pubky) onDismiss();
      };
      const onStorage = (event: StorageEvent) => {
        if (event.key !== storageKey(pubky) && event.key !== doneKey(pubky) && event.key !== null) return;
        // Another tab owns the latest value now.
        unsavedWrites.delete(pubky);
        if (!isDue(pubky)) onDismiss();
      };
      dismissalListeners.add(onLocalDismissal);
      window.addEventListener('storage', onStorage);
      return () => {
        dismissalListeners.delete(onLocalDismissal);
        window.removeEventListener('storage', onStorage);
      };
    },
    resetMemory: () => unsavedWrites.clear(),
  };
}
