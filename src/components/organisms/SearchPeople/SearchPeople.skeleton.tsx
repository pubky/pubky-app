import { Container } from '@/atoms/Container/Container';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';

/** Loading placeholder mirroring the `UserListItem` card variant's shell. */
export function SearchPersonCardSkeleton() {
  return (
    <Container className="gap-3 rounded-md bg-card p-4" data-testid="search-person-card-skeleton">
      <Container overrideDefaults className="flex items-center justify-between gap-3">
        <Container overrideDefaults className="flex min-w-0 flex-1 items-center gap-2">
          <Skeleton className="size-8 shrink-0 rounded-full" />
          <Container overrideDefaults className="min-w-0 space-y-1.5">
            <Skeleton className="h-4 w-32 max-w-full rounded-md" />
            <Skeleton className="h-3 w-24 rounded-md" />
          </Container>
        </Container>
        <Skeleton className="hidden h-8 w-24 rounded-md lg:block" />
      </Container>
      <Container overrideDefaults className="hidden items-center justify-between gap-3 lg:flex">
        <Skeleton className="h-6 w-32 rounded-md" />
        <Skeleton className="size-8 rounded-full" />
      </Container>
    </Container>
  );
}
