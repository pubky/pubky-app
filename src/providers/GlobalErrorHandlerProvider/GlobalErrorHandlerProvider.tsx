'use client';
import { type ReactNode, useEffect, useRef } from 'react';
import { INLINE_IMAGE_UPLOAD_REJECTION_NAME } from '@/hooks/useInlineImageUpload/useInlineImageUpload.types';
import { getErrorMessage } from '@/libs/error/error.utils';
import { Logger } from '@/libs/logger/logger';
import { toast } from '@/molecules/Toaster/toast';

interface GlobalErrorHandlerProviderProps {
  children: ReactNode;
}

const TOAST_THROTTLE_MS = 3000;

export function GlobalErrorHandlerProvider({ children }: GlobalErrorHandlerProviderProps) {
  const toastTimestampsRef = useRef(new Map<string, number>());

  useEffect(() => {
    const notifyError = (error: unknown, operation: string, context: Record<string, unknown>) => {
      // Do NOT wrap via Libs.toAppError here. Sentry's globalHandlers integration already
      // captures the original window.error / unhandledrejection once; wrapping through the
      // Err.* factory would emit a second event with a different fingerprint (the wrapper
      // stack frames replace the original's), creating duplicate Sentry issues.
      // This provider owns the UX side-effect (toast + log) only.
      const message = getErrorMessage(error);
      const now = Date.now();
      const toastKey = `${operation}:${message}`;
      const lastToastTime = toastTimestampsRef.current.get(toastKey);

      Logger.error(`[GlobalErrorHandlerProvider] ${operation}`, {
        ...context,
        error,
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
      toast({ variant: 'error', description: message });
    };

    const onWindowError = (event: ErrorEvent) => {
      notifyError(event.error ?? event.message, 'window.error', {
        filename: event.filename,
        line: event.lineno,
        column: event.colno,
      });
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      // Expected rejections from the article inline-image upload flow: the
      // user was already toasted at the source, but MDXEditor's built-in
      // paste/drop handling rethrows them inside its own .catch, producing a
      // promise nobody can attach a handler to. Not an error condition.
      if (event.reason instanceof Error && event.reason.name === INLINE_IMAGE_UPLOAD_REJECTION_NAME) {
        event.preventDefault();
        return;
      }
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
