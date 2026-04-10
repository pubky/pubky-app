import * as Atoms from '@/atoms';
import * as Molecules from '@/molecules';
import { CompactUserListItemSkeleton } from '@/organisms/CompactUserListItemSkeleton';

const PARTICIPANT_SKELETON_COUNT = 3;

export function SinglePostParticipantsSkeleton({ className }: { className?: string }) {
  return (
    <Molecules.SidebarSection title="" className={className}>
      <Atoms.Skeleton className="mb-2 h-5 w-24 rounded-md" />
      {Array.from({ length: PARTICIPANT_SKELETON_COUNT }).map((_, i) => (
        <CompactUserListItemSkeleton key={`participant-skeleton-${i}`} />
      ))}
    </Molecules.SidebarSection>
  );
}
