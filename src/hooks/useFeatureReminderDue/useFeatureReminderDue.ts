'use client';

import { useEffect, useState } from 'react';
import type { FeatureReminder } from '@/libs/featureDiscovery/featureReminder';

/**
 * Whether a feature-discovery prompt is due for `pubky`. Eligibility is re-checked on a
 * visit or on returning to the tab, never on a timer, so a prompt never interrupts an
 * ongoing visit; a dismissal (here or in another tab) hides it immediately.
 *
 * Pass `enabled: false` for users who can never see the prompt so they never pay for the
 * storage re-check.
 */
export function useFeatureReminderDue(reminder: FeatureReminder, pubky: string | null, enabled = true): boolean {
  const [state, setState] = useState<{ pubky: string | null; due: boolean }>({ pubky: null, due: false });

  useEffect(() => {
    if (!pubky || !enabled) return;
    const check = () => {
      const due = reminder.isDue(pubky);
      setState((previous) => (previous.pubky === pubky && previous.due === due ? previous : { pubky, due }));
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') check();
    };
    const unsubscribe = reminder.subscribeToDismissal(pubky, () => {
      setState({ pubky, due: false });
    });

    check();
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      unsubscribe();
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [reminder, pubky, enabled]);

  // State from a previous account (or from before the prompt was disabled) never leaks through.
  return enabled && Boolean(pubky) && state.pubky === pubky && state.due;
}
