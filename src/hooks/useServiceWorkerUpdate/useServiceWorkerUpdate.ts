'use client';

import { useEffect } from 'react';
import type {} from '@serwist/next/typings';
import { SW_UPDATE_CHECK_MIN_INTERVAL_MS } from '@/config/pwa';
import { toast, type ToastHandle } from '@/molecules/Toaster/toast';

/**
 * Runs the user-consented service worker update flow.
 *
 * Registration belongs to ServiceWorkerRegistrationProvider (root layout). This hook works
 * off the browser's own registration (`navigator.serviceWorker.ready`, `updatefound`,
 * `controllerchange`) rather than the Serwist window client's events, because that client
 * stops reporting updates found more than a minute after registration and latches its
 * `isUpdate` flag at register time.
 *
 * The worker is built with `skipWaiting: false`, so a new version installs and waits.
 * - A waiting worker gets one persistent "Update available" toast per worker; Reload posts
 *   `SKIP_WAITING`, and only the tab that accepted reloads once the new worker controls it.
 * - Other open tabs are claimed by the new worker too (`clientsClaim`); they keep their
 *   in-progress state and get an "Update installed" toast with a Reload action instead of
 *   being reloaded underneath the user.
 * - On every return to the tab the registration is re-checked for a newer waiting worker,
 *   and `registration.update()` is requested at most once per `SW_UPDATE_CHECK_MIN_INTERVAL_MS`.
 *
 * No-op when Serwist is disabled (dev without `SERWIST_DEV`) or the browser has no service
 * worker support: `window.serwist` is undefined in both cases.
 */
export function useServiceWorkerUpdate() {
  useEffect(() => {
    if (!window.serwist || !('serviceWorker' in navigator)) return;
    const container = navigator.serviceWorker;

    let disposed = false;
    let registration: ServiceWorkerRegistration | undefined;
    // The worker the user was last prompted about: a dismissed toast is not re-shown for the
    // same worker, but a newer waiting worker gets a fresh prompt.
    let promptedWorker: ServiceWorker | null = null;
    let updatePrompt: ToastHandle | undefined;
    let acceptedUpdate = false;
    // A controller change on a page that already had a controller is an update taking over;
    // without one it is the first install claiming the page.
    let hadController = Boolean(container.controller);
    let lastUpdateCheckAt = Date.now();

    const promptForWaitingWorker = () => {
      const waiting = registration?.waiting;
      if (!waiting || waiting === promptedWorker) return;
      promptedWorker = waiting;
      updatePrompt = toast({
        variant: 'info',
        title: 'Update available',
        description: 'Reload to get the latest version.',
        persistent: true,
        dismissButton: true,
        action: {
          label: 'Reload',
          altText: 'Reload to update',
          onClick: () => {
            acceptedUpdate = true;
            waiting.postMessage({ type: 'SKIP_WAITING' });
          },
        },
      });
    };

    const trackInstalling = (worker: ServiceWorker | null) => {
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed') promptForWaitingWorker();
      });
    };

    const onUpdateFound = () => trackInstalling(registration?.installing ?? null);

    const onControllerChange = () => {
      if (acceptedUpdate) {
        window.location.reload();
        return;
      }
      // The worker this tab was prompted about has taken over (accepted elsewhere).
      updatePrompt?.dismiss();
      updatePrompt = undefined;
      if (hadController) {
        toast({
          variant: 'info',
          title: 'Update installed',
          description: 'Reload to finish updating.',
          persistent: true,
          dismissButton: true,
          action: { label: 'Reload', altText: 'Reload to finish updating', onClick: () => window.location.reload() },
        });
      }
      hadController = true;
    };

    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      promptForWaitingWorker();
      // Long-lived tabs rarely hard-navigate, so ask the browser to re-check sw.js now and then.
      const now = Date.now();
      if (now - lastUpdateCheckAt < SW_UPDATE_CHECK_MIN_INTERVAL_MS) return;
      lastUpdateCheckAt = now;
      registration?.update().catch(() => undefined);
    };

    container.addEventListener('controllerchange', onControllerChange);
    document.addEventListener('visibilitychange', onVisibilityChange);
    // Resolves once a registration has an active worker (after ServiceWorkerRegistrationProvider
    // registers on a first visit). A worker already waiting at that point is prompted immediately.
    container.ready.then((ready) => {
      if (disposed) return;
      registration = ready;
      ready.addEventListener('updatefound', onUpdateFound);
      trackInstalling(ready.installing);
      promptForWaitingWorker();
    });

    return () => {
      disposed = true;
      container.removeEventListener('controllerchange', onControllerChange);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      registration?.removeEventListener('updatefound', onUpdateFound);
    };
  }, []);
}
