'use client';

import * as Atoms from '@/atoms';
import * as Molecules from '@/molecules';
import * as Hooks from '@/hooks';
import * as Core from '@/core';
import * as Libs from '@/libs';
import { useRouter } from 'next/navigation';
import { APP_ROUTES } from '@/app/routes';
import type { WhoTaggedExpandedListProps } from './WhoTaggedExpandedList.types';

const DEFAULT_CLASSNAME =
  'flex max-h-(--who-tagged-expanded-list-max-height) w-full max-w-(--who-tagged-expanded-list-width) flex-col gap-2 overflow-y-auto rounded-md border border-border bg-popover p-4 shadow-2xl';

/**
 * WhoTaggedExpandedList
 *
 * Displays an expandable list of users (taggers, reposters, etc).
 * Shows each user with their avatar, name, pubky, and a follow/unfollow button.
 * Max height with scroll for overflow.
 */
export function WhoTaggedExpandedList({ taggers, className, 'data-testid': dataTestId }: WhoTaggedExpandedListProps) {
  const router = useRouter();
  const { toggleFollow, isUserLoading } = Hooks.useFollowUser();
  const { requireAuth } = Hooks.useRequireAuth();
  const { currentUserPubky } = Core.useAuthStore();

  const handleFollowClick = async (userId: string, isFollowing: boolean) => {
    requireAuth(() => toggleFollow(userId, isFollowing));
  };

  const handleUserClick = (userId: string) => {
    router.push(`${APP_ROUTES.PROFILE}/${userId}`);
  };

  if (taggers.length === 0) {
    return null;
  }

  return (
    <Atoms.Container
      aria-label="Users expanded list"
      role="list"
      overrideDefaults
      className={Libs.cn(DEFAULT_CLASSNAME, className)}
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
