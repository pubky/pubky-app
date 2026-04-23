'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';
import * as Atoms from '@/atoms';
import { AppError, Logger } from '@/libs';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Logger.error('[app/error] Route segment render error', error);
    // Next.js catches segment render errors before Sentry's automatic handlers.
    // AppError instances are already captured once by Err.* factories via captureAppError;
    // only capture the non-AppError path here to avoid double-emitting the same fingerprint.
    if (!(error instanceof AppError)) {
      Sentry.captureException(error);
    }
  }, [error]);

  return (
    <Atoms.Container className="flex min-h-[50vh] flex-col items-center justify-center p-8 text-center">
      <Atoms.Typography as="h2" size="lg">
        Something went wrong
      </Atoms.Typography>
      <Atoms.Typography size="md" className="mt-2 text-destructive">
        {error.message || 'An unexpected error occurred'}
      </Atoms.Typography>
      <Atoms.Button type="button" className="mt-4" variant="brand" onClick={reset}>
        Try again
      </Atoms.Button>
    </Atoms.Container>
  );
}
