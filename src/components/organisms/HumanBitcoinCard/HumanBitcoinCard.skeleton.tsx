import { Container } from '@/atoms/Container/Container';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';
import { IllustratedCard } from '@/molecules/IllustratedCard/IllustratedCard';

export function HumanBitcoinCardSkeleton() {
  return (
    <Container className="contents lg:relative lg:flex lg:min-w-0">
      <IllustratedCard
        data-testid="bitcoin-payment-card-skeleton"
        layout="column"
        className="contents lg:flex lg:flex-1 lg:rounded-md"
        layoutClassName="contents lg:flex lg:flex-1 lg:gap-6"
        contentClassName="contents lg:flex"
        visualClassName="mx-auto"
        visual={<Skeleton className="size-48 rounded" />}
      >
        <Container className="hidden gap-3 lg:flex">
          <Skeleton className="h-7 w-3/4 rounded lg:h-8" />
          <Skeleton className="h-4 w-full rounded" />
        </Container>
        <Skeleton className="mt-auto h-15 w-full rounded-full" />
      </IllustratedCard>
    </Container>
  );
}
