'use client';

import { useEffect } from 'react';
import { isAppBadgeSupported } from '@/libs/pwa/platform';
import { useNotificationStore } from '@/stores/notification/notification.store';

/**
 * Mirrors the unread notification count onto the installed app's icon badge
 * (Badging API). Unsupported browsers and rejected calls (not installed, no
 * notification permission on iOS) are silent. Logout resets `unread` to 0,
 * which clears the badge.
 */
export function useAppBadge() {
  const unread = useNotificationStore((state) => state.unread);

  useEffect(() => {
    if (!isAppBadgeSupported()) return;
    const update = unread > 0 ? navigator.setAppBadge(unread) : navigator.clearAppBadge();
    update.catch(() => undefined);
  }, [unread]);

  useEffect(() => {
    return () => {
      if (isAppBadgeSupported()) navigator.clearAppBadge().catch(() => undefined);
    };
  }, []);
}
