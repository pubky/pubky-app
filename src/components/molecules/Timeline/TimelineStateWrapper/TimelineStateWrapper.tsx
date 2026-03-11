'use client';

import { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import * as Atoms from '@/atoms';
import { TimelineLoading } from '../TimelineLoading';

interface TimelineStateWrapperProps {
  loading: boolean;
  error: string | null;
  hasItems: boolean;
  children: ReactNode;
  loadingComponent?: ReactNode;
  errorComponent?: ReactNode;
  emptyComponent?: ReactNode;
}

/**
 * Handles rendering of loading, error, and empty states for timeline components.
 * Reduces boilerplate in timeline components by centralizing state rendering logic.
 */
export function TimelineStateWrapper({
  loading,
  error,
  hasItems,
  children,
  loadingComponent,
  errorComponent,
  emptyComponent,
}: TimelineStateWrapperProps) {
  const t = useTranslations('empty');

  if (loading) {
    return <>{loadingComponent ?? <TimelineLoading />}</>;
  }

  if (error && !hasItems) {
    return (
      <>
        {errorComponent ?? (
          <Atoms.Container className="flex items-center justify-center py-8">
            <Atoms.Typography size="md" className="text-destructive">
              Error: {error}
            </Atoms.Typography>
          </Atoms.Container>
        )}
      </>
    );
  }

  if (!hasItems) {
    return (
      <>
        {emptyComponent ?? (
          <Atoms.Container data-cy="timeline-container" className="flex items-center justify-center py-8">
            <Atoms.Typography size="md" className="text-muted-foreground">
              {t('noPosts')}
            </Atoms.Typography>
          </Atoms.Container>
        )}
      </>
    );
  }

  return <>{children}</>;
}
