'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { APP_ROUTES } from '@/app/routes';
import { useFollowUser } from '@/hooks/useFollowUser/useFollowUser';
import { useIsFollowing } from '@/hooks/useIsFollowing/useIsFollowing';
import { usePostParticipants } from '@/hooks/usePostParticipants/usePostParticipants';
import { SidebarSection } from '@/molecules/SidebarSection/SidebarSection';
import { useAuthStore } from '@/stores/auth/auth.store';
import { UserListItem } from '../UserListItem/UserListItem';
import { SinglePostParticipantsSkeleton } from './SinglePostParticipants.skeleton';
import type { ParticipantItemProps, SinglePostParticipantsProps } from './SinglePostParticipants.types';

/**
 * Individual participant item with reactive follow status
 */
function ParticipantItem({
  participant,
  currentUserId,
  onUserClick,
  onFollowClick,
  isUserLoading,
}: ParticipantItemProps) {
  const { isFollowing, isLoading: isFollowStatusLoading } = useIsFollowing(participant.id);
  const isCurrentUser = participant.id === currentUserId;

  return (
    <UserListItem
      user={{
        id: participant.id,
        name: participant.name,
        avatarUrl: participant.avatarUrl,
        image: participant.image,
        isFollowing,
        counts: participant.counts,
      }}
      variant="compact"
      isLoading={isUserLoading(participant.id)}
      isStatusLoading={isFollowStatusLoading}
      isCurrentUser={isCurrentUser}
      onUserClick={onUserClick}
      onFollowClick={onFollowClick}
    />
  );
}

/**
 * SinglePostParticipants Organism
 *
 * Displays participants in a post discussion:
 * - Post author
 * - Reply authors (unique)
 *
 * Uses SidebarSection + UserListItem for consistent layout with other sidebar components.
 */
export function SinglePostParticipants({ postId, className }: SinglePostParticipantsProps) {
  const t = useTranslations('common');
  const router = useRouter();
  const currentUserId = useAuthStore((state) => state.currentUserPubky);
  const { participants, isLoading } = usePostParticipants(postId, { limit: 10 });
  const { toggleFollow, isUserLoading } = useFollowUser();

  const handleUserClick = (pubky: string) => {
    router.push(`${APP_ROUTES.PROFILE}/${pubky}`);
  };

  const handleFollowClick = async (userId: string, isFollowing: boolean, displayName: string) => {
    await toggleFollow(userId, isFollowing, displayName);
  };

  if (isLoading && participants.length === 0) {
    return <SinglePostParticipantsSkeleton className={className} />;
  }

  // Don't render if no participants
  if (participants.length === 0) {
    return null;
  }

  return (
    <SidebarSection title={t('participants')} className={className} data-testid="single-post-participants">
      {participants.map((participant) => (
        <ParticipantItem
          key={participant.id}
          participant={participant}
          currentUserId={currentUserId}
          onUserClick={handleUserClick}
          onFollowClick={handleFollowClick}
          isUserLoading={isUserLoading}
        />
      ))}
    </SidebarSection>
  );
}
