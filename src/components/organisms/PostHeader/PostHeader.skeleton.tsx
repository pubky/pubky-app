import { Container } from '@/atoms/Container/Container';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';

export function PostHeaderSkeleton() {
  return (
    <Container className="flex min-w-0 items-start justify-between gap-3" overrideDefaults>
      <Container className="flex min-w-0 items-center gap-3" overrideDefaults>
        <Skeleton className="size-10 shrink-0 rounded-full" />
        <Container className="flex flex-col gap-1.5" overrideDefaults>
          <Skeleton className="h-4 w-24 rounded-md" />
          <Skeleton className="h-3 w-16 rounded-md" />
        </Container>
      </Container>
      <Skeleton className="h-3 w-12 rounded-md" />
    </Container>
  );
}
