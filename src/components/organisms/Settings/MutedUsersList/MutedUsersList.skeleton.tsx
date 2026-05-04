import { Container } from '@/atoms/Container/Container';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';

const MUTED_USER_SKELETON_COUNT = 3;

export function MutedUsersListSkeleton() {
  return (
    <Container overrideDefaults className="inline-flex w-full flex-col gap-6">
      {Array.from({ length: MUTED_USER_SKELETON_COUNT }).map((_, i) => (
        <Container
          overrideDefaults
          key={`muted-user-skeleton-${i}`}
          className="flex w-full items-center justify-between gap-3"
        >
          <Container overrideDefaults className="flex min-w-0 flex-1 items-center gap-3">
            <Skeleton className="size-10 shrink-0 rounded-full" />
            <Container overrideDefaults className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Skeleton className="h-4 w-28 rounded-md" />
              <Skeleton className="h-3 w-20 rounded-md" />
            </Container>
          </Container>
          <Skeleton className="h-8 w-20 shrink-0 rounded-full" />
        </Container>
      ))}
    </Container>
  );
}
