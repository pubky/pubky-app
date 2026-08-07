'use client';

import { useState } from 'react';
import { DatabaseZap, RefreshCw, RotateCw } from 'lucide-react';
import { Button, ButtonVariant } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Spinner } from '@/atoms/Spinner/Spinner';
import { Typography } from '@/atoms/Typography/Typography';

interface DatabaseErrorScreenProps {
  /** Re-runs database initialization (wired to `DatabaseContext.retry`). */
  onRetry: () => void | Promise<void>;
}

/**
 * Full-screen recovery state shown when the local IndexedDB database fails to initialize.
 * Blocks the broken app from rendering and offers the user a way to recover without losing context.
 */
export function DatabaseErrorScreen({ onRetry }: DatabaseErrorScreenProps) {
  const [isRetrying, setIsRetrying] = useState(false);

  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      await onRetry();
    } finally {
      setIsRetrying(false);
    }
  };

  const handleReload = () => {
    window.location.reload();
  };

  return (
    <Container
      overrideDefaults
      data-testid="database-error-screen"
      className="flex min-h-screen w-full flex-col items-center justify-center gap-6 p-6"
    >
      <Container overrideDefaults className="flex shrink-0 items-center justify-center rounded-full bg-brand/16 p-6">
        <DatabaseZap className="size-12 text-brand" strokeWidth={1.5} />
      </Container>

      <Container overrideDefaults className="flex w-full max-w-md flex-col items-center justify-center gap-3">
        <Typography as="h1" size="lg" className="text-center leading-8">
          {'Storage unavailable'}
        </Typography>
        <Typography as="p" className="text-center text-base leading-6 font-medium text-secondary-foreground">
          {
            "We couldn't access your device's local storage. Some mobile browsers, especially in-app browsers, can interrupt it. Please try again or reload the page."
          }
        </Typography>
      </Container>

      <Container overrideDefaults className="flex flex-col flex-wrap items-center justify-center gap-3 sm:flex-row">
        <Button type="button" onClick={handleRetry} disabled={isRetrying}>
          {isRetrying ? <Spinner size="sm" /> : <RotateCw className="size-4 shrink-0" />}
          {isRetrying ? 'Retrying…' : 'Try again'}
        </Button>
        <Button type="button" variant={ButtonVariant.SECONDARY} onClick={handleReload} disabled={isRetrying}>
          <RefreshCw className="size-4 shrink-0" />
          {'Reload page'}
        </Button>
      </Container>
    </Container>
  );
}
