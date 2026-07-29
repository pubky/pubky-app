import { Container } from '@/atoms/Container/Container';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';
import { IllustratedCard } from '@/molecules/IllustratedCard/IllustratedCard';

type PriceSkeletonVariant = 'badge' | 'conversion' | 'price';

type PriceSkeletonProps = {
  variant: PriceSkeletonVariant;
};

/**
 * Skeleton for the price badge and conversion line while loading.
 */
export function PriceSkeleton({ variant }: PriceSkeletonProps) {
  switch (variant) {
    case 'badge':
      return <Skeleton className="h-6 w-20 rounded-md lg:hidden" />;
    case 'conversion':
      return (
        <>
          <Skeleton className="mt-1 h-3.5 w-36 rounded lg:hidden" />
          <Skeleton className="hidden h-3 w-32 rounded lg:block" />
        </>
      );
    case 'price':
      return <Skeleton className="hidden h-12 w-36 rounded lg:block lg:h-15" />;
    default: {
      const exhaustiveCheck: never = variant;
      return exhaustiveCheck;
    }
  }
}

/**
 * Skeleton loading state for Bitcoin payment card.
 */
export function HumanBitcoinCardSkeleton() {
  return (
    <Container className="relative flex-1">
      <IllustratedCard
        data-testid="bitcoin-payment-card-skeleton"
        className="flex-1 rounded-md"
        contentClassName="gap-4 lg:gap-6"
        visualClassName="gap-3"
        visual={
          <>
            <Skeleton className="size-48 rounded" />
            <Skeleton className="mx-auto h-3 w-28 rounded" />
          </>
        }
      >
        <Container className="flex-col gap-3">
          <Container className="flex-row items-center justify-between gap-4 lg:justify-start">
            <Skeleton className="h-5 w-40 rounded lg:h-8 lg:w-48" />
            <Skeleton className="h-6 w-20 rounded-md lg:hidden" />
          </Container>
          <Skeleton className="hidden h-12 w-36 rounded lg:block lg:h-15" />
          <Skeleton className="mt-1 h-3.5 w-36 rounded lg:mt-0 lg:hidden" />
          <Skeleton className="hidden h-3 w-32 rounded lg:block" />
          <Container className="hidden flex-col gap-1 lg:flex">
            <Skeleton className="h-6 w-24 rounded" />
            <Skeleton className="h-6 w-32 rounded" />
          </Container>
        </Container>
        <Container className="gap-2 lg:hidden">
          <Skeleton className="h-6 w-32 rounded" />
          <Skeleton className="h-6 w-40 rounded" />
        </Container>
        <Skeleton className="h-10 w-full rounded-full lg:w-28" />
      </IllustratedCard>
    </Container>
  );
}
