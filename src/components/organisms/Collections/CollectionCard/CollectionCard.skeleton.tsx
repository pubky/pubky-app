'use client';

import { Card, CardContent } from '@/atoms/Card/Card';
import { Container } from '@/atoms/Container/Container';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';
import { useEffectiveTagsLayout } from '@/hooks/useEffectiveTagsLayout/useEffectiveTagsLayout';
import { cn } from '@/libs/utils/utils';

interface CollectionCardSkeletonProps {
  className?: string;
}

/**
 * Skeleton loading state for `CollectionCard`.
 *
 * Mirrors the real card's outer shape (rounded card, padding, two-row body
 * with a header + tags row). Used by the three landing sections while
 * their data fetches are in flight.
 */
export function CollectionCardSkeleton({ className }: CollectionCardSkeletonProps) {
  const isWideLayout = useEffectiveTagsLayout() === 'side';

  return (
    <Container
      overrideDefaults
      data-testid="collection-card-skeleton"
      className={cn('relative block w-full', className)}
    >
      <Card className="relative gap-0 overflow-hidden rounded-md py-0">
        <CardContent className={cn('flex flex-col gap-3', isWideLayout ? 'p-12' : 'p-6')}>
          {/* Mobile: title row, then metadata. Desktop: title (left) | metadata (right). */}
          <Container overrideDefaults className="flex w-full flex-col items-start gap-3 lg:flex-row lg:items-center">
            <Container overrideDefaults className="flex w-full min-w-0 items-center gap-2 lg:flex-1">
              <Skeleton className="size-6 shrink-0 rounded-md" />
              <Skeleton className={cn('max-w-full rounded-md', isWideLayout ? 'h-8 w-56' : 'h-5 w-48')} />
            </Container>
            <Container overrideDefaults className="flex shrink-0 items-center gap-3">
              <Skeleton className="h-3 w-6 rounded-md" />
              <Skeleton className={cn('shrink-0 rounded-full', isWideLayout ? 'size-12' : 'size-9')} />
            </Container>
          </Container>

          {/* Description (1 line, near-full width) */}
          <Skeleton className="h-4 w-11/12 rounded-md" />

          {/* Bottom row: tag chips + add button */}
          <Container overrideDefaults className="flex w-full items-center gap-3">
            <Container overrideDefaults className="flex min-w-0 flex-1 items-center gap-2">
              <Skeleton className="h-7 w-20 rounded-md" />
              <Skeleton className="h-7 w-24 rounded-md" />
              <Skeleton className="size-6 shrink-0 rounded-full" />
            </Container>
          </Container>
        </CardContent>
      </Card>
    </Container>
  );
}
