import * as Atoms from '@/atoms';

const NOTIFICATION_SKELETON_COUNT = 5;
const NOTIFICATION_LOAD_MORE_SKELETON_COUNT = 2;

function NotificationItemSkeleton({ index }: { index: number }) {
  return (
    <Atoms.Container
      overrideDefaults
      className="flex items-start gap-3 border-b border-border px-4 py-4"
      data-testid={`notification-skeleton-${index}`}
    >
      <Atoms.Skeleton className="size-10 shrink-0 rounded-full" />
      <Atoms.Container overrideDefaults className="flex min-w-0 flex-1 flex-col gap-2">
        <Atoms.Skeleton className="h-4 w-3/4 rounded-md" />
        <Atoms.Skeleton className="h-3 w-1/2 rounded-md" />
      </Atoms.Container>
      <Atoms.Skeleton className="h-3 w-10 shrink-0 rounded-md" />
    </Atoms.Container>
  );
}

export function NotificationsContainerSkeleton() {
  return (
    <Atoms.Container overrideDefaults className="flex flex-col">
      {Array.from({ length: NOTIFICATION_SKELETON_COUNT }).map((_, i) => (
        <NotificationItemSkeleton key={`notification-skeleton-${i}`} index={i} />
      ))}
    </Atoms.Container>
  );
}

export function NotificationsLoadMoreSkeleton() {
  return (
    <Atoms.Container overrideDefaults className="flex flex-col">
      {Array.from({ length: NOTIFICATION_LOAD_MORE_SKELETON_COUNT }).map((_, i) => (
        <NotificationItemSkeleton key={`notification-load-more-skeleton-${i}`} index={i} />
      ))}
    </Atoms.Container>
  );
}
