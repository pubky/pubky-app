import { Container } from '@/atoms/Container/Container';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';

export function ShareTargetSkeleton() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Container className="mx-auto w-full max-w-2xl gap-4 p-4">
        <Container className="flex-row items-center justify-between" overrideDefaults>
          <Skeleton className="h-6 w-32 rounded-md" />
          <Skeleton className="h-8 w-16 rounded-md" />
        </Container>
        <Skeleton className="h-32 w-full rounded-md" />
      </Container>
    </div>
  );
}
