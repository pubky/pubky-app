'use client';

import { useEffect, useState } from 'react';
import { isReminderDue, remindLater, subscribeToDismissal } from '@/libs/vibes/vibesReminder';
import { useAuthStore } from '@/stores/auth/auth.store';

export function useVibesAlert() {
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  const [visibility, setVisibility] = useState<{ pubky: string | null; visible: boolean }>({
    pubky: null,
    visible: false,
  });

  useEffect(() => {
    if (!currentUserPubky) return;
    const checkVisit = () => {
      setVisibility({ pubky: currentUserPubky, visible: isReminderDue(currentUserPubky) });
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') checkVisit();
    };
    const unsubscribe = subscribeToDismissal(currentUserPubky, () => {
      setVisibility({ pubky: currentUserPubky, visible: false });
    });

    // Recheck on a visit or return to the tab, never on a timer during a visit.
    checkVisit();
    window.addEventListener('focus', checkVisit);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      unsubscribe();
      window.removeEventListener('focus', checkVisit);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [currentUserPubky]);

  const visible = Boolean(currentUserPubky) && visibility.pubky === currentUserPubky && visibility.visible;

  return {
    visible,
    remindLater: () => {
      if (currentUserPubky && visible) remindLater(currentUserPubky);
    },
  };
}
