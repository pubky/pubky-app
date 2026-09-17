'use client';

import { useEffect } from 'react';
import type {} from '@serwist/next/typings';
import { SW_UPDATE_CHECK_MIN_INTERVAL_MS } from '@/config/pwa';
import { toast, type ToastHandle, type ToastOptions } from '@/molecules/Toaster/toast';

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
 * - At most one update toast is shown at a time; a newer state replaces it. A waiting
 *   worker gets a persistent "Update available" prompt once; Reload posts `SKIP_WAITING`
 *   to whichever worker is waiting at that moment, and only the tab that accepted reloads
 *   once the new worker controls it.
 * - Other open tabs are claimed by the new worker too (`clientsClaim`); they keep their
 *   in-progress state and get an "Update installed" prompt with a Reload action instead
 *   of being reloaded underneath the user.
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
    // The worker the user was last prompted about: a dismissed prompt is not re-shown for the
    // same worker, but a newer waiting worker gets a fresh prompt.
    let promptedWorker: ServiceWorker | null = null;
    let prompt: ToastHandle | undefined;
    let acceptedUpdate = false;
    // A controller change on a page that already had a controller, or that was prompted about
    // a waiting worker, is an update taking over; otherwise it is the first install claiming
    // the page (a hard reload bypasses the worker, so a controlled origin can still load uncontrolled).
    let hadController = Boolean(container.controller);
    let lastUpdateCheckAt = Date.now();
    const workerListeners = new Map<ServiceWorker, () => void>();

    // One update toast at a time: the newest state replaces whatever was showing.
    const showPrompt = (options: ToastOptions) => {
      prompt?.dismiss();
      prompt = toast(options);
    };

    const acceptUpdate = () => {
      // Read the live waiting worker: the one this prompt was created for may have been
      // superseded by a newer install (and would be `redundant`, which cannot be messaged).
      const waiting = registration?.waiting;
      if (!waiting) return;
      acceptedUpdate = true;
      waiting.postMessage({ type: 'SKIP_WAITING' });
    };

    const promptForWaitingWorker = () => {
      if (disposed) return;
      const waiting = registration?.waiting;
      if (!waiting || waiting === promptedWorker) return;
      promptedWorker = waiting;
      showPrompt({
        variant: 'info',
        title: 'Update available',
        description: 'Reload to get the latest version.',
        persistent: true,
        dismissButton: true,
        action: { label: 'Reload', altText: 'Reload to update', onClick: acceptUpdate },
      });
    };

    const untrack = (worker: ServiceWorker) => {
      workerListeners.get(worker)?.();
      workerListeners.delete(worker);
    };

    const trackInstalling = (worker: ServiceWorker | null) => {
      if (!worker || workerListeners.has(worker)) return;
      const onStateChange = () => {
        if (worker.state === 'installed') promptForWaitingWorker();
        if (worker.state === 'activated' || worker.state === 'redundant') untrack(worker);
      };
      worker.addEventListener('statechange', onStateChange);
      workerListeners.set(worker, () => worker.removeEventListener('statechange', onStateChange));
    };

    const onUpdateFound = () => trackInstalling(registration?.installing ?? null);

    const onControllerChange = () => {
      if (disposed) return;
      if (acceptedUpdate) {
        window.location.reload();
        return;
      }
      const isUpdate = hadController || promptedWorker !== null;
      hadController = true;
      if (!isUpdate) return;
      showPrompt({
        variant: 'info',
        title: 'Update installed',
        description: 'Reload to finish updating.',
        persistent: true,
        dismissButton: true,
        action: { label: 'Reload', altText: 'Reload to finish updating', onClick: () => window.location.reload() },
      });
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
      workerListeners.forEach((remove) => remove());
      workerListeners.clear();
    };
  }, []);
}
