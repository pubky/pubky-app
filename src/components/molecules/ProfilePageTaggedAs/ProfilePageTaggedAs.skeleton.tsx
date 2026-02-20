import * as Atoms from '@/atoms';
import { SKELETON_TAG_ROWS } from './ProfilePageTaggedAs.constants';

export function ProfilePageTaggedAsSkeleton() {
  return (
    <Atoms.Container overrideDefaults className="flex flex-col gap-2" data-testid="profile-tagged-skeleton">
      {Array.from({ length: SKELETON_TAG_ROWS }).map((_, index) => (
        <Atoms.Skeleton key={`profile-tagged-skeleton-${index}`} className="h-8 w-full rounded-md" />
      ))}
    </Atoms.Container>
  );
}
