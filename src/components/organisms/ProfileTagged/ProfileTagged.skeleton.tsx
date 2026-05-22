import { Container } from '@/atoms/Container/Container';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';

const SKELETON_TAG_COUNT = 4;

export function ProfileTaggedSkeleton() {
  return (
    <Container className="gap-3">
      <Skeleton className="h-7 w-32 rounded-md" />
      <Container overrideDefaults className="flex flex-wrap gap-2">
        {Array.from({ length: SKELETON_TAG_COUNT }).map((_, i) => (
          <Skeleton key={`profile-tagged-skeleton-${i}`} className="h-8 w-20 rounded-full" />
        ))}
      </Container>
    </Container>
  );
}
