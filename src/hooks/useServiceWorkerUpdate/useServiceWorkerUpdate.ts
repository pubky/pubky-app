/// <reference types="@serwist/next/typings" />
'use client';

import { useEffect } from 'react';
import { SW_UPDATE_CHECK_MIN_INTERVAL_MS } from '@/config/pwa';
import { toast, type ToastHandle } from '@/molecules/Toaster/toast';

// Module-level so remounts share one throttle window for `registration.update()` checks.
let lastUpdateCheckAt = 0;

/**
 * Runs the user-consented service worker update flow.
 *
 * Registration itself belongs to ServiceWorkerRegistrationProvider (root layout), whose
 * effect runs after this hook's, so the `waiting` / `controlling` listeners below are
 * attached before `register()` is called (a `waiting` event dispatched before a listener
 * exists is lost). The worker is built with `skipWaiting: false`: a new version installs,
 * waits, and this hook shows a persistent "Update available" toast. Reload posts
 * `SKIP_WAITING`; once the new worker controls the page, every open tab reloads so no tab
 * keeps running chunks the new precache dropped.
 *
 * No-op when Serwist is disabled (dev without `SERWIST_DEV`) or the browser has no service
 * worker support: `window.serwist` is undefined in both cases.
 */
export function useServiceWorkerUpdate() {
  useEffect(() => {
    const serwist = window.serwist;
    if (!serwist) return;

    let waitingWorker: ServiceWorker | undefined;
    let updateToast: ToastHandle | undefined;

    const showUpdateToast = () => {
      updateToast?.dismiss();
      updateToast = toast({
        variant: 'info',
        title: 'Update available',
        description: 'Reload to get the latest version.',
        persistent: true,
        action: { label: 'Reload', altText: 'Reload to update', onClick: () => serwist.messageSkipWaiting() },
      });
    };

    const onWaiting = (event: { sw?: ServiceWorker }) => {
      waitingWorker = event.sw;
      showUpdateToast();
    };

    const onControlling = (event: { isUpdate?: boolean }) => {
      // The first install claims the page with `isUpdate: false`: nothing to reload.
      // After a reload the new worker is already the controller, so no further
      // `controlling` event fires until a genuinely newer worker activates.
      if (event.isUpdate) window.location.reload();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      // The toast limit or a swipe may have removed the toast while an update still waits.
      if (waitingWorker?.state === 'installed') showUpdateToast();
      // Long-lived tabs rarely hard-navigate, so ask the browser to re-check sw.js.
      const now = Date.now();
      if (now - lastUpdateCheckAt < SW_UPDATE_CHECK_MIN_INTERVAL_MS) return;
      lastUpdateCheckAt = now;
      serwist.update().catch(() => undefined);
    };

    serwist.addEventListener('waiting', onWaiting);
    serwist.addEventListener('controlling', onControlling);
    document.addEventListener('visibilitychange', onVisibilityChange);

    // Registration (and the first update check it implies) happens right after mount.
    if (lastUpdateCheckAt === 0) lastUpdateCheckAt = Date.now();

    return () => {
      serwist.removeEventListener('waiting', onWaiting);
      serwist.removeEventListener('controlling', onControlling);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);
}
