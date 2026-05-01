import { Skeleton } from '@/atoms/Skeleton/Skeleton';
import { SidebarSection } from '@/molecules/SidebarSection/SidebarSection';
import { CompactUserListItemSkeleton } from '../CompactUserListItemSkeleton/CompactUserListItemSkeleton';

const PARTICIPANT_SKELETON_COUNT = 3;

export function SinglePostParticipantsSkeleton({ className }: { className?: string }) {
  return (
    <SidebarSection title="" className={className}>
      <Skeleton className="mb-2 h-5 w-24 rounded-md" />
      {Array.from({ length: PARTICIPANT_SKELETON_COUNT }).map((_, i) => (
        <CompactUserListItemSkeleton key={`participant-skeleton-${i}`} />
      ))}
    </SidebarSection>
  );
}
