'use client';

import { useRouter } from 'next/navigation';
import * as Atoms from '@/atoms';
import * as Molecules from '@/molecules';
import * as Hooks from '@/hooks';
import * as Core from '@/core';
import { APP_ROUTES } from '@/app/routes';
import type { TaggerWithAvatar } from '@/molecules/TaggedItem/TaggedItem.types';
import type { WhoTaggedExpandedListProps } from './WhoTaggedExpandedList.types';
import { WhoTaggedExpandedListSkeleton } from './WhoTaggedExpandedList.skeleton';

/**
 * WhoTaggedExpandedList
 *
 * Displays an expandable list of users who tagged a post/content.
 * Shows each user with their avatar, name, pubky, and a follow/unfollow button.
 * Max height of 300px with scroll for overflow.
 */
export function WhoTaggedExpandedList({
  taggerIds,
  fallbackTaggers,
  isLoadingTaggers,
  'data-testid': dataTestId,
}: WhoTaggedExpandedListProps) {
  const router = useRouter();
  const { toggleFollow, isUserLoading } = Hooks.useFollowUser();
  const { requireAuth } = Hooks.useRequireAuth();
  const { currentUserPubky } = Core.useAuthStore();
  const { getUsersWithAvatars } = Hooks.useBulkUserAvatars(taggerIds);

  // Build fallback map for user data not yet in IndexedDB
  const fallbackMap = new Map<string, TaggerWithAvatar>();
  (fallbackTaggers ?? []).forEach((tagger) => {
    fallbackMap.set(tagger.id, tagger);
  });

  // Merge user data from IndexedDB with fallback data
  const taggers = getUsersWithAvatars(taggerIds).map((tagger) => {
    const fallback = fallbackMap.get(tagger.id);
    return {
      id: tagger.id,
      name: tagger.name ?? fallback?.name,
      avatarUrl: tagger.avatarUrl ?? fallback?.avatarUrl ?? '',
    };
  });

  const handleFollowClick = async (userId: string, isFollowing: boolean) => {
    requireAuth(() => toggleFollow(userId, isFollowing));
  };

  const handleUserClick = (userId: string) => {
    router.push(`${APP_ROUTES.PROFILE}/${userId}`);
  };

  if (taggerIds.length === 0) {
    return null;
  }

  if (isLoadingTaggers) {
    return <WhoTaggedExpandedListSkeleton />;
  }

  return (
    <Atoms.Container
      aria-label="Who tagged expanded list"
      role="list"
      overrideDefaults
      className="flex max-h-(--who-tagged-expanded-list-max-height) w-full max-w-(--who-tagged-expanded-list-width) flex-col gap-2 overflow-y-auto rounded-md border border-border bg-popover p-4 shadow-2xl"
      data-testid={dataTestId || 'who-tagged-expanded-list'}
    >
      {taggers.map((tagger) => (
        <Molecules.TaggerUserRow
          key={tagger.id}
          tagger={tagger}
          isLoading={isUserLoading(tagger.id)}
          isCurrentUser={tagger.id === currentUserPubky}
          onUserClick={handleUserClick}
          onFollowClick={handleFollowClick}
        />
      ))}
    </Atoms.Container>
  );
}
