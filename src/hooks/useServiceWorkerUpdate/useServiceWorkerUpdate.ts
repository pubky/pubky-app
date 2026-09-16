/// <reference types="@serwist/next/typings" />
'use client';

import { useEffect } from 'react';
import { SW_UPDATE_CHECK_MIN_INTERVAL_MS } from '@/config/pwa';
import { Logger } from '@/libs/logger/logger';
import { toast, type ToastHandle } from '@/molecules/Toaster/toast';

// Module-level so StrictMode's double mount and later remounts never register twice.
let registrationStarted = false;
let lastUpdateCheckAt = 0;

/**
 * Registers the service worker and runs the user-consented update flow.
 *
 * `@serwist/next` is configured with `register: false`, so registration happens
 * here, after the lifecycle listeners are attached (a `waiting` event dispatched
 * before a listener exists is lost). The worker is built with `skipWaiting: false`:
 * a new version installs, waits, and this hook shows a persistent "Update available"
 * toast. Reload posts `SKIP_WAITING`; once the new worker controls the page,
 * every open tab reloads so no tab keeps running chunks the new precache dropped.
 *
 * No-op when Serwist is disabled (dev without `SERWIST_DEV`) or the browser has
 * no service worker support: `window.serwist` is undefined in both cases.
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

    if (!registrationStarted) {
      registrationStarted = true;
      lastUpdateCheckAt = Date.now();
      serwist.register().catch((error: unknown) => {
        Logger.warn('[useServiceWorkerUpdate] Service worker registration failed', { error });
      });
    }

    return () => {
      serwist.removeEventListener('waiting', onWaiting);
      serwist.removeEventListener('controlling', onControlling);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);
}
