'use client';

import { useEffect } from 'react';
import * as Atoms from '@/atoms';
import { Logger } from '@/libs/logger/logger';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Logger.error('[app/error] Route segment render error', error);
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
