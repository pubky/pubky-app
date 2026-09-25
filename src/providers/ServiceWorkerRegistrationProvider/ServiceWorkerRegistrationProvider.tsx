'use client';

import { type ReactNode, useEffect } from 'react';
import { Serwist } from '@serwist/window';
import { Logger } from '@/libs/logger/logger';
import { isServiceWorkerEnabled } from '@/libs/pwa/platform';

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
  useEffect(() => {
    if (!isServiceWorkerEnabled()) return;

    // No `online` reload: the local-first UI recovers on its own and useNetworkStatusToasts reports
    // connectivity (ADR-0021).
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
