'use client';

import { type ReactNode, useEffect } from 'react';
// Type-only import: Serwist declares `Window.serwist` in its `@serwist/next/typings` entry (a
// types-only export), which the injected entry relies on.
import type {} from '@serwist/next/typings';
import { Logger } from '@/libs/logger/logger';

interface ServiceWorkerRegistrationProviderProps {
  children: ReactNode;
}

/**
 * Registers the Serwist service worker from app code instead of letting `@serwist/next` do it.
 *
 * The entry Serwist injects calls `window.serwist.register()` without a `.catch()`, so a rejection
 * from `navigator.serviceWorker.register()` escapes as an unhandled promise rejection and Sentry's
 * global handler reports it as a product error. Those rejections are browser and network conditions
 * we cannot act on — the script fetch failing, "Rejected", iOS Safari and WKWebView quirks — so
 * `register: false` in `next.config.ts` disables the automatic call and registration happens here,
 * where the rejection is handled.
 *
 * Registration itself is unchanged: same script URL, same scope and the same timing as the injected
 * entry (both read the script and scope off `window.serwist`, and `register()` still waits for the
 * window load event).
 */
export function ServiceWorkerRegistrationProvider({ children }: ServiceWorkerRegistrationProviderProps) {
  useEffect(() => {
    // `window.serwist` is created by Serwist's injected entry, which does not run in development
    // (Serwist is disabled there) nor in browsers without service worker support.
    const serwist = window.serwist;
    if (!serwist) return;

    try {
      // A failed registration is expected behaviour rather than an error to report: log it quietly
      // and let the app run without a service worker. Swallowing the rejection keeps it away from
      // Sentry's global handler, which reports unhandled rejections whatever their origin.
      void serwist.register().catch((error: unknown) => {
        Logger.warn('[ServiceWorkerRegistrationProvider] Service worker registration failed', { error });
      });
    } catch (error) {
      // `window.serwist` is a page global: guard against a value that is not a Serwist instance
      // rather than letting the effect throw.
      Logger.warn('[ServiceWorkerRegistrationProvider] Service worker registration threw', { error });
    }
  }, []);

  return <>{children}</>;
}
