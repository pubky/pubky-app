'use client';

import { useEffect } from 'react';
import * as Atoms from '@/atoms';
import { getErrorMessage, Logger } from '@/libs';
import type { ErrorFallbackProps } from './ErrorBoundaryProvider.types';

/**
 * ErrorFallback
 *
 * Fallback UI displayed when an unhandled error occurs during React render.
 * Shows a user-friendly error message.
 */
export function ErrorFallback({ error, resetErrorBoundary }: ErrorFallbackProps) {
  const message = getErrorMessage(error);

  useEffect(() => {
    Logger.error('[ErrorBoundaryProvider] Caught render error', error);
  }, [error]);

  return (
    <Atoms.Container className="flex min-h-[50vh] flex-col items-center justify-center p-8">
      <Atoms.Container className="flex flex-col items-center gap-2 text-center">
        <Atoms.Typography as="h2" size="lg">
          Something went wrong
        </Atoms.Typography>
        <Atoms.Typography size="md" className="text-destructive">
          {message}
        </Atoms.Typography>
        <Atoms.Button variant={Atoms.ButtonVariant.GHOST} onClick={resetErrorBoundary} className="mt-3">
          Try again
        </Atoms.Button>
      </Atoms.Container>
    </Atoms.Container>
  );
}
