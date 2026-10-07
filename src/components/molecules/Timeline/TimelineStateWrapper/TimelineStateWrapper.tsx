'use client';

import { ReactNode } from 'react';
import { Container } from '@/atoms/Container/Container';
import { Typography } from '@/atoms/Typography/Typography';
import { TimelineLoading } from '../TimelineLoading';

interface TimelineStateWrapperProps {
  loading: boolean;
  error: string | null;
  hasItems: boolean;
  /**
   * True while the stream may still surface posts (not exhausted). An empty list with
   * `hasMore` keeps the loading state AND mounts the children: the infinite-scroll
   * sentinel lives in the children, and showing the empty component instead would
   * unmount it and permanently stall the feed one load-round away from real posts
   * (heavily-filtered stream regions return empty pages while more content exists).
   */
  hasMore?: boolean;
  /**
   * True while automatic loading is paused by the infinite-scroll budget (consecutive
   * rounds surfaced nothing new). The empty-but-`hasMore` state then renders only the
   * children, which own the manual "Load more" affordance — a loading skeleton would
   * promise progress that nothing is making.
   */
  stalled?: boolean;
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
  hasMore = false,
  stalled = false,
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

  if (!hasItems && hasMore) {
    return (
      <>
        {!stalled && (loadingComponent ?? <TimelineLoading />)}
        {children}
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
