'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Typography } from '@/atoms/Typography/Typography';
import { APP_VERSION } from '@/config/app';
import { claimStaleChunkReload, isChunkLoadError } from '@/libs/chunk-load/chunkLoadRecovery';
import { AppError } from '@/libs/error/error';
import { Logger } from '@/libs/logger/logger';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // A chunk the previous build served is gone after a deploy. Reload once to pick up the current
    // build; the reload is a breadcrumb rather than an error because it is expected and self-heals,
    // and it is claimed once per build so a genuinely broken build cannot loop.
    if (isChunkLoadError(error) && claimStaleChunkReload()) {
      Sentry.addBreadcrumb({
        category: 'chunk-load',
        level: 'warning',
        message: 'Reloading after a stale chunk failed to load',
        data: { build: APP_VERSION },
      });
      Logger.warn('[app/error] Stale chunk load failure; reloading for build', APP_VERSION);
      window.location.reload();
      return;
    }

    Logger.error('[app/error] Route segment render error', error);
    // Next.js catches segment render errors before Sentry's automatic handlers.
    // AppError instances are already captured once by Err.* factories via captureAppError;
    // only capture the non-AppError path here to avoid double-emitting the same fingerprint.
    if (!(error instanceof AppError)) {
      Sentry.captureException(error);
    }
  }, [error]);

  return (
    <Container className="flex min-h-[50vh] flex-col items-center justify-center p-8 text-center">
      <Typography as="h2" size="lg">
        Something went wrong
      </Typography>
      <Typography size="md" className="mt-2 text-destructive">
        {error.message || 'Unexpected error occurred.'}
      </Typography>
      <Button type="button" className="mt-4" variant="brand" onClick={reset}>
        Try again
      </Button>
    </Container>
  );
}
