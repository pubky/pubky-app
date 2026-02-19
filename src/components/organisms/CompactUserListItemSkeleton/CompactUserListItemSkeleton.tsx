import * as Atoms from '@/atoms';

export function CompactUserListItemSkeleton() {
  return (
    <Atoms.Container
      overrideDefaults
      className="flex w-full items-center gap-3"
      data-testid="user-list-item-skeleton-compact"
    >
      <Atoms.Skeleton className="size-10 shrink-0 rounded-full" />

      <Atoms.Container overrideDefaults className="flex min-w-0 flex-1 flex-col gap-2">
        <Atoms.Skeleton className="h-4 w-full max-w-[150px] rounded-md" />
        <Atoms.Skeleton className="h-4 w-full max-w-[130px] rounded-md" />
      </Atoms.Container>
    </Atoms.Container>
  );
}
