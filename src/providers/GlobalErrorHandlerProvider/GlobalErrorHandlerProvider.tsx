'use client';

import type { ReactNode } from 'react';
import { useEffect } from 'react';
import * as Libs from '@/libs';
import * as Molecules from '@/molecules';

interface GlobalErrorHandlerProviderProps {
  children: ReactNode;
}

function notifyError(error: unknown, operation: string, context: Record<string, unknown>) {
  const appError = Libs.toAppError(error, Libs.ErrorService.Local, operation);

  Libs.Logger.error(`[GlobalErrorHandlerProvider] ${operation}`, {
    ...context,
    error: appError,
  });

  Molecules.showErrorToast({
    description: Libs.getErrorMessage(appError),
  });
}

export function GlobalErrorHandlerProvider({ children }: GlobalErrorHandlerProviderProps) {
  useEffect(() => {
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
