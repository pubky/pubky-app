import { Container } from '@/atoms/Container/Container';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';

export function CompactUserListItemSkeleton() {
  return (
    <Container
      overrideDefaults
      className="flex w-full items-center gap-3"
      data-testid="user-list-item-skeleton-compact"
    >
      <Skeleton className="size-10 shrink-0 rounded-full" />

      <Container overrideDefaults className="flex min-w-0 flex-1 flex-col gap-2">
        <Skeleton className="h-4 w-full max-w-[150px] rounded-md" />
        <Skeleton className="h-4 w-full max-w-[130px] rounded-md" />
      </Container>
    </Container>
  );
}
