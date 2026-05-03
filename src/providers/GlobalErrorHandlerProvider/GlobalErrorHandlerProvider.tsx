'use client';
import { useEffect, useRef, type ReactNode } from 'react';
import { showErrorToast } from '@/molecules/Toaster/showErrorToast';

import { Logger } from '@/libs/logger/logger';
import { ErrorService } from '@/libs/error/error.types';
import { getErrorMessage, toAppError } from '@/libs/error/error.utils';

interface GlobalErrorHandlerProviderProps {
  children: ReactNode;
}

const TOAST_THROTTLE_MS = 3000;

export function GlobalErrorHandlerProvider({ children }: GlobalErrorHandlerProviderProps) {
  const toastTimestampsRef = useRef(new Map<string, number>());

  useEffect(() => {
    const notifyError = (error: unknown, operation: string, context: Record<string, unknown>) => {
      const appError = toAppError(error, ErrorService.Local, operation);
      const message = getErrorMessage(appError);
      const now = Date.now();
      const toastKey = `${operation}:${message}`;
      const lastToastTime = toastTimestampsRef.current.get(toastKey);

      Logger.error(`[GlobalErrorHandlerProvider] ${operation}`, {
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
      showErrorToast({ description: message });
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
