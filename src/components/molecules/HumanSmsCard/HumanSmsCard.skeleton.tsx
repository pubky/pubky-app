import { Card } from '@/atoms/Card/Card';
import { Container } from '@/atoms/Container/Container';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';

/**
 * Skeleton loading state for SMS verification card.
 */
export function HumanSmsCardSkeleton() {
  return (
    <Container className="relative flex-1">
      <Card data-testid="sms-verification-card-skeleton" className="flex-1 gap-0 rounded-md p-6 lg:p-12">
        <Container className="w-full flex-col gap-4 lg:flex-row lg:items-start lg:gap-12">
          <Container className="hidden w-48 shrink-0 lg:block">
            <Skeleton className="size-48 rounded" />
          </Container>

          <Container className="w-full flex-col gap-4 lg:max-w-xl lg:flex-1 lg:gap-6">
            <Container className="w-full flex-col gap-3">
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
          </Container>
        </Container>
      </Card>
    </Container>
  );
}
