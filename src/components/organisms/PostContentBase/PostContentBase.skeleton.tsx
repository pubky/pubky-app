import { Container } from '@/atoms/Container/Container';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';

export function PostContentBaseSkeleton() {
  return (
    <Container className="flex min-w-0 flex-col gap-y-1" overrideDefaults>
      <Skeleton className="h-4 w-full rounded-md" />
      <Skeleton className="h-4 w-4/5 rounded-md" />
      <Skeleton className="h-4 w-3/5 rounded-md" />
    </Container>
  );
}
