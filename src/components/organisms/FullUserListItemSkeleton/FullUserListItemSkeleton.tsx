import * as Atoms from '@/atoms';

export function FullUserListItemSkeleton() {
  return (
    <Atoms.Container
      className="gap-3 rounded-md bg-card p-6 lg:bg-transparent lg:p-0"
      data-testid="user-list-item-skeleton-full"
    >
      <Atoms.Container overrideDefaults className="flex flex-wrap items-center justify-between gap-6 lg:flex-nowrap">
        <Atoms.Container overrideDefaults className="flex min-w-0 flex-1 items-center gap-2">
          <Atoms.Skeleton className="size-10 shrink-0 rounded-full" />
          <Atoms.Container overrideDefaults className="min-w-0 space-y-1.5">
            <Atoms.Skeleton className="h-4 w-32 max-w-full rounded-md" />
            <Atoms.Skeleton className="h-3 w-24 rounded-md" />
          </Atoms.Container>
        </Atoms.Container>

        <Atoms.Skeleton className="hidden h-6 w-32 rounded-md xl:block" />

        <Atoms.Container overrideDefaults className="flex shrink-0 items-center gap-3">
          <Atoms.Container className="items-start gap-1">
            <Atoms.Skeleton className="h-3 w-10 rounded-md" />
            <Atoms.Skeleton className="h-4 w-6 rounded-md" />
          </Atoms.Container>
          <Atoms.Container className="items-start gap-1">
            <Atoms.Skeleton className="h-3 w-10 rounded-md" />
            <Atoms.Skeleton className="h-4 w-6 rounded-md" />
          </Atoms.Container>
        </Atoms.Container>

        <Atoms.Skeleton className="hidden h-8 w-[110px] rounded-md lg:block" />
      </Atoms.Container>

      <Atoms.Container overrideDefaults className="flex flex-wrap items-center justify-between gap-3 lg:hidden">
        <Atoms.Skeleton className="h-6 flex-1 rounded-md" />
        <Atoms.Skeleton className="h-8 w-[110px] rounded-md" />
      </Atoms.Container>
    </Atoms.Container>
  );
}
