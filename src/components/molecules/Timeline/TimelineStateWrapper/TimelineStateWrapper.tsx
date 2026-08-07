'use client';

import { ReactNode } from 'react';
import { Container } from '@/atoms/Container/Container';
import { Typography } from '@/atoms/Typography/Typography';
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
  if (loading) {
    return <>{loadingComponent ?? <TimelineLoading />}</>;
  }

  if (error && !hasItems) {
    return (
      <>
        {errorComponent ?? (
          <Container className="flex items-center justify-center py-8">
            <Typography size="md" className="text-destructive">
              Error: {error}
            </Typography>
          </Container>
        )}
      </>
    );
  }

  if (!hasItems) {
    return (
      <>
        {emptyComponent ?? (
          <Container data-cy="timeline-container" className="flex items-center justify-center py-8">
            <Typography size="md" className="text-muted-foreground">
              {'No posts found'}
            </Typography>
          </Container>
        )}
      </>
    );
  }

  return <>{children}</>;
}
