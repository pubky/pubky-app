'use client';

import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import * as Libs from '@/libs';
import * as Molecules from '@/molecules';

interface GlobalErrorHandlerProviderProps {
  children: ReactNode;
}

const TOAST_THROTTLE_MS = 3000;

export function GlobalErrorHandlerProvider({ children }: GlobalErrorHandlerProviderProps) {
  const toastTimestampsRef = useRef(new Map<string, number>());

  useEffect(() => {
    const notifyError = (error: unknown, operation: string, context: Record<string, unknown>) => {
      const appError = Libs.toAppError(error, Libs.ErrorService.Local, operation);
      const message = Libs.getErrorMessage(appError);
      const now = Date.now();
      const toastKey = `${operation}:${message}`;
      const lastToastTime = toastTimestampsRef.current.get(toastKey);

      Libs.Logger.error(`[GlobalErrorHandlerProvider] ${operation}`, {
        ...context,
        error: appError,
      });

      if (lastToastTime !== undefined && now - lastToastTime < TOAST_THROTTLE_MS) {
        return;
      }

      for (const [key, timestamp] of toastTimestampsRef.current.entries()) {
        if (now - timestamp >= TOAST_THROTTLE_MS) {
          toastTimestampsRef.current.delete(key);
        }
      }

      toastTimestampsRef.current.set(toastKey, now);
      Molecules.showErrorToast({ description: message });
    };

    const onWindowError = (event: ErrorEvent) => {
      notifyError(event.error ?? event.message, 'window.error', {
        filename: event.filename,
        line: event.lineno,
        column: event.colno,
      });
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      notifyError(event.reason, 'window.unhandledrejection', {});
    };

    window.addEventListener('error', onWindowError);
    window.addEventListener('unhandledrejection', onUnhandledRejection);

    return () => {
      window.removeEventListener('error', onWindowError);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
    };
  }, []);

  return <>{children}</>;
}
