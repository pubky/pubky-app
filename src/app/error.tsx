'use client';

import { useEffect } from 'react';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Typography } from '@/atoms/Typography/Typography';

import { Logger } from '@/libs/logger/logger';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Logger.error('[app/error] Route segment render error', error);
  }, [error]);

  return (
    <Container className="flex min-h-[50vh] flex-col items-center justify-center p-8 text-center">
      <Typography as="h2" size="lg">
        Something went wrong
      </Typography>
      <Typography size="md" className="mt-2 text-destructive">
        {error.message || 'An unexpected error occurred'}
      </Typography>
      <Button type="button" className="mt-4" variant="brand" onClick={reset}>
        Try again
      </Button>
    </Container>
  );
}
