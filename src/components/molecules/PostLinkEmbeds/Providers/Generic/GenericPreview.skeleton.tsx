import { Container } from '@/atoms/Container/Container';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';

export function GenericPreviewSkeleton() {
  return (
    <Container className="justify-between gap-6 rounded-md p-6 lg:flex-row @max-xl/grid:flex-col!">
      <Container className="gap-y-2">
        <Skeleton className="h-5 w-48 rounded-md" />
        <Skeleton className="h-4 w-32 rounded-md" />
      </Container>
      <Skeleton className="h-25 w-45 shrink-0 rounded-md" />
    </Container>
  );
}
