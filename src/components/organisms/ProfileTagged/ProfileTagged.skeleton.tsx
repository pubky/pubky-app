import * as Atoms from '@/atoms';

const SKELETON_TAG_COUNT = 4;

export function ProfileTaggedSkeleton() {
  return (
    <Atoms.Container className="gap-3">
      <Atoms.Skeleton className="h-7 w-32 rounded-md" />
      <Atoms.Container overrideDefaults className="flex flex-wrap gap-2">
        {Array.from({ length: SKELETON_TAG_COUNT }).map((_, i) => (
          <Atoms.Skeleton key={`profile-tagged-skeleton-${i}`} className="h-8 w-20 rounded-full" />
        ))}
      </Atoms.Container>
    </Atoms.Container>
  );
}
