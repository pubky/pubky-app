'use client';

import * as Atoms from '@/atoms';

export function FeedbackCardSkeleton() {
  return (
    <Atoms.Container
      overrideDefaults={true}
      data-testid="feedback-card-skeleton"
      className="flex w-full max-w-(--filter-bar-width) flex-col gap-2"
    >
      <Atoms.Skeleton data-testid="feedback-card-skeleton-heading" className="h-8 w-32 rounded-md" />

      <Atoms.Container
        overrideDefaults={true}
        className="flex w-full min-w-0 flex-col gap-4 rounded-lg border border-dashed border-input p-6"
      >
        <Atoms.Container overrideDefaults={true} className="flex w-full min-w-0 items-center gap-2">
          <Atoms.Skeleton data-testid="feedback-card-skeleton-avatar" className="h-12 w-12 shrink-0 rounded-md" />
          <Atoms.Skeleton className="h-6 w-40 max-w-full rounded-md" />
        </Atoms.Container>

        <Atoms.Skeleton data-testid="feedback-card-skeleton-button" className="h-12 w-full rounded-md" />
      </Atoms.Container>
    </Atoms.Container>
  );
}
