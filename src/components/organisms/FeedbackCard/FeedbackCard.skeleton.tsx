'use client';
import { Container } from '@/atoms/Container/Container';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';

export function FeedbackCardSkeleton() {
  return (
    <Container
      overrideDefaults={true}
      data-testid="feedback-card-skeleton"
      className="flex w-full max-w-(--filter-bar-width) flex-col gap-2"
    >
      <Skeleton data-testid="feedback-card-skeleton-heading" className="h-8 w-32 rounded-md" />

      <Container
        overrideDefaults={true}
        className="flex w-full min-w-0 flex-col gap-4 rounded-lg border border-dashed border-input p-6"
      >
        <Container overrideDefaults={true} className="flex w-full min-w-0 items-center gap-2">
          <Skeleton data-testid="feedback-card-skeleton-avatar" className="h-12 w-12 shrink-0 rounded-md" />
          <Skeleton className="h-6 w-40 max-w-full rounded-md" />
        </Container>

        <Skeleton data-testid="feedback-card-skeleton-button" className="h-12 w-full rounded-md" />
      </Container>
    </Container>
  );
}
