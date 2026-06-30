import { Card, CardContent } from '@/atoms/Card/Card';
import { Container } from '@/atoms/Container/Container';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';
import { cn } from '@/libs/utils/utils';

interface CollectionHeroSkeletonProps {
  className?: string;
}

/**
 * Skeleton loading state for `CollectionHero`.
 *
 * Mirrors the real hero's outer shape (tall rounded banner, generous padding,
 * vertically stacked title → owner → description → tags → actions) so the hero
 * never flashes a half-empty state while `usePostDetails` resolves.
 */
export function CollectionHeroSkeleton({ className }: CollectionHeroSkeletonProps) {
  return (
    <Card
      data-testid="collection-hero-skeleton"
      className={cn('relative gap-0 overflow-hidden rounded-md py-0', className)}
    >
      <CardContent className="flex flex-col justify-center gap-4 p-8 lg:p-12">
        {/* Title */}
        <Skeleton className="h-12 w-80 max-w-full rounded-md lg:h-16" />

        {/* Owner + item count */}
        <Container overrideDefaults className="flex w-full items-center gap-6">
          <Container overrideDefaults className="flex min-w-0 flex-1 items-center gap-2 lg:flex-none">
            <Skeleton className="size-8 shrink-0 rounded-full" />
            <Skeleton className="h-5 w-32 rounded-md" />
          </Container>
          <Skeleton className="h-4 w-10 shrink-0 rounded-md" />
        </Container>

        {/* Description (2 lines) */}
        <Container overrideDefaults className="flex w-full max-w-3xl flex-col gap-2">
          <Skeleton className="h-5 w-full rounded-md" />
          <Skeleton className="h-5 w-2/3 rounded-md" />
        </Container>

        {/* Tags */}
        <Container overrideDefaults className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-7 w-20 rounded-md" />
          <Skeleton className="h-7 w-16 rounded-md" />
          <Skeleton className="size-8 shrink-0 rounded-md" />
        </Container>

        {/* Actions */}
        <Container overrideDefaults className="flex flex-wrap items-center gap-3">
          <Skeleton className="h-8 w-24 rounded-full" />
          <Skeleton className="h-8 w-20 rounded-full" />
        </Container>
      </CardContent>
    </Card>
  );
}
