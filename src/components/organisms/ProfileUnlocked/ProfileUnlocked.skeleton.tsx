import { Container } from '@/atoms/Container/Container';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';

/** Placeholder cards shown while the list loads; the real length is unknown until it resolves. */
// exported for tests
export const UNLOCKED_SKELETON_COUNT = 3;

export function ProfileUnlockedSkeleton() {
  return (
    <Container data-cy="profile-unlocked-skeleton" className="gap-4">
      {Array.from({ length: UNLOCKED_SKELETON_COUNT }, (_, index) => (
        <Skeleton key={index} className="h-28 w-full rounded-lg" />
      ))}
    </Container>
  );
}
