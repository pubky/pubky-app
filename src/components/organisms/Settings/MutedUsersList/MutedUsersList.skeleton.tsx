import * as Atoms from '@/atoms';

const MUTED_USER_SKELETON_COUNT = 3;

export function MutedUsersListSkeleton() {
  return (
    <Atoms.Container overrideDefaults className="inline-flex w-full flex-col gap-6">
      {Array.from({ length: MUTED_USER_SKELETON_COUNT }).map((_, i) => (
        <Atoms.Container
          overrideDefaults
          key={`muted-user-skeleton-${i}`}
          className="flex w-full items-center justify-between gap-3"
        >
          <Atoms.Container overrideDefaults className="flex min-w-0 flex-1 items-center gap-3">
            <Atoms.Skeleton className="size-10 shrink-0 rounded-full" />
            <Atoms.Container overrideDefaults className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Atoms.Skeleton className="h-4 w-28 rounded-md" />
              <Atoms.Skeleton className="h-3 w-20 rounded-md" />
            </Atoms.Container>
          </Atoms.Container>
          <Atoms.Skeleton className="h-8 w-20 shrink-0 rounded-full" />
        </Atoms.Container>
      ))}
    </Atoms.Container>
  );
}
