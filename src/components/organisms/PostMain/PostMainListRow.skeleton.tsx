import { CardContent } from '@/atoms/Card/Card';
import { Container } from '@/atoms/Container/Container';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';

export function PostMainListRowSkeleton() {
  return (
    <CardContent className="flex min-w-0 items-center gap-4 p-6">
      <Skeleton className="size-10 shrink-0 rounded-full" />
      <Container overrideDefaults className="flex min-w-0 flex-1 flex-col gap-1.5">
        <Skeleton className="h-5 w-2/4 rounded-md" />
        <Skeleton className="h-3 w-32 rounded-md" />
      </Container>
    </CardContent>
  );
}
