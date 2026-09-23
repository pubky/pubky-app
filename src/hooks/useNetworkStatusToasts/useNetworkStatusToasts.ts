'use client';

import { useEffect, useRef } from 'react';
import { useNetworkStatus } from '@/hooks/useNetworkStatus/useNetworkStatus';
import { toast, type ToastHandle } from '@/molecules/Toaster/toast';

/**
 * Tells the user when the browser goes offline and when it comes back.
 *
 * Nothing is shown on an online mount. A page opened offline shows the offline
 * toast once (the first client render uses the server snapshot, then re-renders
 * with `navigator.onLine`), never a spurious "Back online".
 */
export function useNetworkStatusToasts() {
  const isOnline = useNetworkStatus();
  const previousRef = useRef<boolean | null>(null);
  const offlineToastRef = useRef<ToastHandle | null>(null);

  useEffect(() => {
    const previous = previousRef.current;
    if (previous === isOnline) return;
    previousRef.current = isOnline;

    if (!isOnline) {
      offlineToastRef.current = toast({
        variant: 'warning',
        title: "You're offline",
        description: "Showing what's saved on this device.",
      });
      return;
    }

    if (previous === false) {
      offlineToastRef.current?.dismiss();
      offlineToastRef.current = null;
      toast({ variant: 'info', title: 'Back online' });
    }
  }, [isOnline]);
}
