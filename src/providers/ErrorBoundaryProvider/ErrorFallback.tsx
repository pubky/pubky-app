'use client';

import { useEffect } from 'react';
import { Button, ButtonVariant } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Typography } from '@/atoms/Typography/Typography';
import { getErrorMessage } from '@/libs/error/error.utils';
import { Logger } from '@/libs/logger/logger';
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
    <Container className="flex min-h-[50vh] flex-col items-center justify-center p-8">
      <Container className="flex flex-col items-center gap-2 text-center">
        <Typography as="h2" size="lg">
          Something went wrong
        </Typography>
        <Typography size="md" className="text-destructive">
          {message}
        </Typography>
        <Button variant={ButtonVariant.GHOST} onClick={resetErrorBoundary} className="mt-3">
          Try again
        </Button>
      </Container>
    </Container>
  );
}
