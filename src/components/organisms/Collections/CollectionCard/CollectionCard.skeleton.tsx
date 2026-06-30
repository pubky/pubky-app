import { Card, CardContent } from '@/atoms/Card/Card';
import { Container } from '@/atoms/Container/Container';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';
import { cn } from '@/libs/utils/utils';

interface CollectionCardSkeletonProps {
  className?: string;
}

/**
 * Skeleton loading state for `CollectionCard`.
 *
 * Mirrors the real card's outer shape (rounded card, padding, two-row body
 * with a header + tag/CTA row). Used by the three landing sections while
 * their data fetches are in flight.
 */
export function CollectionCardSkeleton({ className }: CollectionCardSkeletonProps) {
  return (
    <Container
      overrideDefaults
      data-testid="collection-card-skeleton"
      className={cn('relative block w-full lg:max-w-187', className)}
    >
      <Card className="relative gap-0 overflow-hidden rounded-md py-0">
        <CardContent className="flex flex-col gap-3 p-6">
          {/* Header row: icon + title (left) | count + avatar (right) */}
          <Container overrideDefaults className="flex w-full flex-wrap items-center gap-3 sm:flex-nowrap">
            <Container overrideDefaults className="flex min-w-0 flex-1 items-center gap-2">
              <Skeleton className="size-6 shrink-0 rounded-md" />
              <Skeleton className="h-5 w-48 max-w-full rounded-md" />
            </Container>
            <Container overrideDefaults className="flex shrink-0 items-center gap-3">
              <Skeleton className="h-3 w-6 rounded-md" />
              <Skeleton className="size-9 shrink-0 rounded-full" />
            </Container>
          </Container>

          {/* Description (1 line, near-full width) */}
          <Skeleton className="h-4 w-11/12 rounded-md" />

          {/* Bottom row: tag chips + add button (left) | CTA (right) */}
          <Container
            overrideDefaults
            className="flex w-full flex-wrap items-center justify-between gap-3 sm:flex-nowrap"
          >
            <Container overrideDefaults className="flex min-w-0 flex-1 items-center gap-2">
              <Skeleton className="h-7 w-20 rounded-md" />
              <Skeleton className="h-7 w-24 rounded-md" />
              <Skeleton className="size-6 shrink-0 rounded-full" />
            </Container>
            <Skeleton className="h-8 w-28 shrink-0 rounded-md" />
          </Container>
        </CardContent>
      </Card>
    </Container>
  );
}
