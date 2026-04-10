'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as Atoms from '@/atoms';
import * as Molecules from '@/molecules';
import * as Organisms from '@/organisms';
import * as Hooks from '@/hooks';
import * as Libs from '@/libs';
import * as Core from '@/core';
import { APP_ROUTES } from '@/app/routes';
import type { SinglePostParticipantsProps, ParticipantItemProps } from './SinglePostParticipants.types';

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
  const { isFollowing, isLoading: isFollowStatusLoading } = Hooks.useIsFollowing(participant.id);
  const isCurrentUser = participant.id === currentUserId;

  return (
    <Organisms.UserListItem
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
  const currentUserId = Core.useAuthStore((state) => state.currentUserPubky);
  const { participants, isLoading } = Hooks.usePostParticipants(postId, { limit: 10 });
  const { toggleFollow, isUserLoading } = Hooks.useFollowUser();

  const handleUserClick = (pubky: string) => {
    router.push(`${APP_ROUTES.PROFILE}/${pubky}`);
  };

  const handleFollowClick = async (userId: string, isFollowing: boolean) => {
    await toggleFollow(userId, isFollowing);
  };

  // Show loading state
  if (isLoading && participants.length === 0) {
    return (
      <Atoms.Container className={Libs.cn('flex items-center justify-center gap-2 py-4', className)}>
        <Atoms.Spinner size="md" />
        <Atoms.Typography as="p" className="text-muted-foreground">
          {t('loadingParticipants')}
        </Atoms.Typography>
      </Atoms.Container>
    );
  }

  // Don't render if no participants
  if (participants.length === 0) {
    return null;
  }

  return (
    <Molecules.SidebarSection title={t('participants')} className={className} data-testid="single-post-participants">
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
    </Molecules.SidebarSection>
  );
}
