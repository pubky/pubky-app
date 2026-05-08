import { Container } from '@/atoms/Container/Container';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';

const MENU_ITEM_SKELETON_COUNT = 4;

export function PostMenuActionsContentSkeleton() {
  return (
    <Container overrideDefaults className="flex flex-col gap-1 p-1">
      {Array.from({ length: MENU_ITEM_SKELETON_COUNT }).map((_, i) => (
        <Container key={`post-menu-skeleton-${i}`} overrideDefaults className="flex items-center gap-2 px-2 py-1.5">
          <Skeleton className="size-4 shrink-0 rounded" />
          <Skeleton className="h-4 w-24 rounded-md" />
        </Container>
      ))}
    </Container>
  );
}
