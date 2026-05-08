import { Container } from '@/atoms/Container/Container';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';
import { SKELETON_TAG_ROWS } from './ProfilePageTaggedAs.constants';

export function ProfilePageTaggedAsSkeleton() {
  return (
    <Container overrideDefaults className="flex flex-col gap-2" data-testid="profile-tagged-skeleton">
      {Array.from({ length: SKELETON_TAG_ROWS }).map((_, index) => (
        <Skeleton key={`profile-tagged-skeleton-${index}`} className="h-8 w-full rounded-md" />
      ))}
    </Container>
  );
}
