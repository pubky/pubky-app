import { Container } from '@/atoms/Container/Container';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';

export function FullUserListItemSkeleton() {
  return (
    <Container
      className="gap-3 rounded-md bg-card p-6 lg:bg-transparent lg:p-0"
      data-testid="user-list-item-skeleton-full"
    >
      <Container overrideDefaults className="flex flex-wrap items-center justify-between gap-6 lg:flex-nowrap">
        <Container overrideDefaults className="flex min-w-0 flex-1 items-center gap-2">
          <Skeleton className="size-10 shrink-0 rounded-full" />
          <Container overrideDefaults className="min-w-0 space-y-1.5">
            <Skeleton className="h-4 w-32 max-w-full rounded-md" />
            <Skeleton className="h-3 w-24 rounded-md" />
          </Container>
        </Container>

        <Skeleton className="hidden h-6 w-32 rounded-md xl:block" />

        <Container overrideDefaults className="flex shrink-0 items-center gap-3">
          <Container className="items-start gap-1">
            <Skeleton className="h-3 w-10 rounded-md" />
            <Skeleton className="h-4 w-6 rounded-md" />
          </Container>
          <Container className="items-start gap-1">
            <Skeleton className="h-3 w-10 rounded-md" />
            <Skeleton className="h-4 w-6 rounded-md" />
          </Container>
        </Container>

        <Skeleton className="hidden h-8 w-[110px] rounded-md lg:block" />
      </Container>

      <Container overrideDefaults className="flex flex-wrap items-center justify-between gap-3 lg:hidden">
        <Skeleton className="h-6 flex-1 rounded-md" />
        <Skeleton className="h-8 w-[110px] rounded-md" />
      </Container>
    </Container>
  );
}
