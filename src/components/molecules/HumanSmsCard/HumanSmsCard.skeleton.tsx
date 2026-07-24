import { Container } from '@/atoms/Container/Container';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';
import { IllustratedCard } from '../IllustratedCard/IllustratedCard';

/**
 * Skeleton loading state for SMS verification card.
 */
export function HumanSmsCardSkeleton() {
  return (
    <Container className="relative flex-1">
      <IllustratedCard
        data-testid="sms-verification-card-skeleton"
        className="flex-1 rounded-md"
        contentClassName="gap-4 lg:gap-6"
        visual={<Skeleton className="size-48 rounded" />}
      >
        <Container className="flex-col gap-3">
          <Container className="flex-row items-center justify-between gap-4 lg:justify-start">
            <Skeleton className="h-5 w-48 rounded lg:h-8 lg:w-56" />
            <Skeleton className="h-6 w-14 rounded-md lg:hidden" />
          </Container>
          <Skeleton className="hidden h-12 w-20 rounded lg:block lg:h-15" />
          <Skeleton className="mt-1 h-3.5 w-44 rounded lg:mt-0" />
          <Container className="hidden flex-col gap-1 lg:flex">
            <Skeleton className="h-6 w-24 rounded" />
            <Skeleton className="h-6 w-32 rounded" />
          </Container>
        </Container>
        <Container className="gap-2 lg:hidden">
          <Skeleton className="h-6 w-32 rounded" />
          <Skeleton className="h-6 w-40 rounded" />
        </Container>
        <Skeleton className="h-10 w-full rounded-full lg:w-36" />
      </IllustratedCard>
    </Container>
  );
}
