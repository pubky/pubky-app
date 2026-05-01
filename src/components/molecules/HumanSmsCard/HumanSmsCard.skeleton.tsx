import { Card } from '@/atoms/Card/Card';
import { Container } from '@/atoms/Container/Container';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';

/**
 * Skeleton loading state for SMS verification card.
 */
export function HumanSmsCardSkeleton() {
  return (
    <Container className="relative flex-1">
      <Card data-testid="sms-verification-card-skeleton" className="flex-1 gap-0 p-6 md:p-12">
        <Container className="flex-col gap-10 lg:flex-row lg:items-center lg:gap-12">
          {/* Image skeleton - hidden on mobile */}
          <Container className="hidden h-full w-full flex-1 items-center lg:block lg:w-auto">
            <Skeleton className="size-48 rounded" />
          </Container>

          <Container className="w-full flex-1 items-start gap-6">
            <Container className="w-full gap-3">
              <Skeleton className="h-8 w-48 rounded" />
              <Skeleton className="h-12 w-20 rounded lg:h-15" />
              <Skeleton className="h-4 w-44 rounded" />
              <Container className="gap-1">
                <Skeleton className="h-6 w-24 rounded" />
                <Skeleton className="h-6 w-32 rounded" />
              </Container>
            </Container>
            <Skeleton className="h-10 w-36 rounded-full" />
          </Container>
        </Container>
      </Card>
    </Container>
  );
}
