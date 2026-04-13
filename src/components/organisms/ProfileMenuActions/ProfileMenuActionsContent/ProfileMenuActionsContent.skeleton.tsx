import * as Atoms from '@/atoms';

const MENU_ITEM_SKELETON_COUNT = 3;

export function ProfileMenuActionsContentSkeleton() {
  return (
    <Atoms.Container overrideDefaults className="flex flex-col gap-1 p-1">
      {Array.from({ length: MENU_ITEM_SKELETON_COUNT }).map((_, i) => (
        <Atoms.Container
          key={`profile-menu-skeleton-${i}`}
          overrideDefaults
          className="flex items-center gap-2 px-2 py-1.5"
        >
          <Atoms.Skeleton className="size-4 shrink-0 rounded" />
          <Atoms.Skeleton className="h-4 w-24 rounded-md" />
        </Atoms.Container>
      ))}
    </Atoms.Container>
  );
}
