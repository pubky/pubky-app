'use client';
import { Inter_Tight } from 'next/font/google';
import './globals.css';

import { useEffect } from 'react';
import * as Atoms from '@/atoms';
import { Logger } from '@/libs';

const interTight = Inter_Tight({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Logger.error('[app/global-error] Root render error', error);
  }, [error]);

  return (
    <Atoms.Container as="html" lang="en" dir="ltr">
      <Atoms.Container as="body" className={`${interTight.variable} antialiased`}>
        <Atoms.Container className="flex min-h-[50vh] flex-col items-center justify-center p-8 text-center">
          <Atoms.Typography as="h2" size="lg">
            Something went wrong
          </Atoms.Typography>
          <Atoms.Typography size="md" className="mt-2 text-destructive">
            {error.message || 'An unexpected error occurred'}
          </Atoms.Typography>
          <Atoms.Button type="button" className="mt-4" variant="brand" onClick={() => reset()}>
            Try again
          </Atoms.Button>
        </Atoms.Container>
      </Atoms.Container>
    </Atoms.Container>
  );
}
