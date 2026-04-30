import { Card } from '@/atoms/Card/Card';
import { Container } from '@/atoms/Container/Container';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';

/**
 * Skeleton for the price section while loading.
 */
export function PriceSkeleton() {
  return (
    <>
      <Skeleton className="h-12 w-36 rounded lg:h-15" />
      <Skeleton className="h-4 w-32 rounded" />
    </>
  );
}

/**
 * Skeleton loading state for Bitcoin payment card.
 */
export function HumanBitcoinCardSkeleton() {
  return (
    <Container className="relative flex-1">
      <Card data-testid="bitcoin-payment-card-skeleton" className="flex-1 gap-0 p-6 md:p-12">
        <Container className="flex-col gap-10 lg:flex-row lg:items-start lg:gap-12">
          {/* Image + label skeleton - hidden on mobile */}
          <Container className="hidden w-full flex-1 flex-col items-center gap-3 lg:flex lg:w-auto">
            <Skeleton className="size-48 rounded" />
            <Skeleton className="h-4 w-28 rounded" />
          </Container>

          <Container className="w-full flex-1 items-start gap-6">
            <Container className="w-full gap-3">
              <Skeleton className="h-8 w-40 rounded" />
              <Skeleton className="h-12 w-36 rounded lg:h-15" />
              <Skeleton className="h-4 w-32 rounded" />
              <Container className="gap-1">
                <Skeleton className="h-6 w-24 rounded" />
                <Skeleton className="h-6 w-32 rounded" />
              </Container>
            </Container>
            <Skeleton className="h-10 w-28 rounded-full" />
          </Container>
        </Container>
      </Card>
    </Container>
  );
}
