'use client';

import { useRouter } from 'next/navigation';
import { getUserProfileUrl } from '@/app/routes';
import { useFollowUser } from '@/hooks/useFollowUser/useFollowUser';
import { useResourceParticipants } from '@/hooks/useResourceParticipants/useResourceParticipants';
import { SidebarSection } from '@/molecules/SidebarSection/SidebarSection';
import { ParticipantItem } from '@/organisms/SinglePostParticipants/SinglePostParticipants';
import { SinglePostParticipantsSkeleton } from '@/organisms/SinglePostParticipants/SinglePostParticipants.skeleton';
import { useAuthStore } from '@/stores/auth/auth.store';

/**
 * The post page's Participants panel for an external resource: the people who replied to or
 * tagged the link (`useResourceParticipants`), in the post page's section and rows. Nothing shows
 * when nobody did, as on a post.
 *
 * @param uri - The link the thread is on (the tagged URI)
 * @param replyIds - The thread's reply ids (`useResourceReplies`)
 */
export function ResourceParticipants({ uri, replyIds }: { uri: string; replyIds: string[] }) {
  const router = useRouter();
  const currentUserId = useAuthStore((state) => state.currentUserPubky);
  const { participants, isLoading } = useResourceParticipants(uri, replyIds);
  const { toggleFollow, isUserLoading } = useFollowUser();

  if (isLoading && participants.length === 0) return <SinglePostParticipantsSkeleton />;
  if (participants.length === 0) return null;

  return (
    <SidebarSection title="Participants" data-testid="resource-participants">
      {participants.map((participant) => (
        <ParticipantItem
          key={participant.id}
          participant={participant}
          currentUserId={currentUserId}
          onUserClick={(pubky) => router.push(getUserProfileUrl(pubky, currentUserId))}
          onFollowClick={toggleFollow}
          isUserLoading={isUserLoading}
        />
      ))}
    </SidebarSection>
  );
}
