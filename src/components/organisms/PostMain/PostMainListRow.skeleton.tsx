import { CardContent } from '@/atoms/Card/Card';
import { Container } from '@/atoms/Container/Container';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';

export function PostMainListRowSkeleton() {
  return (
    <CardContent className="flex min-w-0 items-center gap-4 p-6">
      <Skeleton className="size-10 shrink-0 rounded-full" />
      <Container overrideDefaults className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-4 w-3/4 max-w-sm" />
        <Skeleton className="h-3 w-1/3 max-w-32" />
      </Container>
      <Skeleton className="hidden h-8 w-32 shrink-0 md:block" />
      <Skeleton className="hidden h-12 w-20 shrink-0 rounded-sm md:block" />
    </CardContent>
  );
}
