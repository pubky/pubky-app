import { Container } from '@/atoms/Container/Container';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';
import { GRID_FEED_COLUMNS_CLASS, GRID_FEED_GAP_CLASS, GRID_FEED_SKELETON_COUNT } from '@/config/feed';
import { POST_CONTENT_PENDING_PROPS } from '@/hooks/useCardsLayout/useCardsLayout.utils';
import { cn } from '@/libs/utils/utils';

export function CardsPostSkeleton({ index = 0 }: { index?: number }) {
  return (
    <Container {...POST_CONTENT_PENDING_PROPS} className="gap-6 rounded-md bg-card p-6">
      <Container overrideDefaults className="flex items-center gap-3">
        <Skeleton className="size-10 rounded-full" />
        <Skeleton className="h-4 w-24" />
      </Container>
      <Skeleton className={index % 2 === 0 ? 'h-64 w-full' : 'h-32 w-full'} />
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-6 w-full" />
    </Container>
  );
}

export function CardsPostsSkeleton() {
  return (
    <Container
      overrideDefaults
      data-cy="cards-skeleton"
      className={cn('grid items-start', GRID_FEED_COLUMNS_CLASS, GRID_FEED_GAP_CLASS)}
    >
      {Array.from({ length: GRID_FEED_SKELETON_COUNT }, (_, index) => (
        <CardsPostSkeleton key={index} index={index} />
      ))}
    </Container>
  );
}
