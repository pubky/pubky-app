'use client';

import { type ReactNode, useEffect, useRef } from 'react';
import { Serwist } from '@serwist/window';
import { Logger } from '@/libs/logger/logger';

interface ServiceWorkerRegistrationProviderProps {
  children: ReactNode;
}

/**
 * Registers the separately built worker without a bundler-injected window global.
 * Serwist still waits for window load. Expected browser/network registration failures are
 * handled here so they do not reach Sentry as unhandled promise rejections.
 *
 * It wraps PwaManager, so this effect runs after useServiceWorkerUpdate has attached its
 * lifecycle listeners (docs/pwa.md).
 */
export function ServiceWorkerRegistrationProvider({ children }: ServiceWorkerRegistrationProviderProps) {
  const registrationStarted = useRef(false);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator) || typeof caches === 'undefined')
      return;

    // StrictMode replays effects; register once. No `online` reload: the local-first UI recovers on
    // its own and useNetworkStatusToasts reports connectivity (ADR-0021).
    if (registrationStarted.current) return;
    registrationStarted.current = true;
    try {
      const serwist = new Serwist('/sw.js', { scope: '/', type: 'classic' });
      void serwist.register().catch((error: unknown) => {
        Logger.warn('[ServiceWorkerRegistrationProvider] Service worker registration failed', { error });
      });
    } catch (error) {
      Logger.warn('[ServiceWorkerRegistrationProvider] Service worker registration threw', { error });
    }
  }, []);

  return <>{children}</>;
}
