'use client';

import { useIsFollowing } from '@/hooks/useIsFollowing/useIsFollowing';
import * as Organisms from '@/organisms';
import type { TaggerUserRowProps } from './TaggerUserRow.types';

/**
 * TaggerUserRow
 *
 * Component that wraps UserListItem and fetches the follow relationship
 * for each individual tagger. This allows us to use the useIsFollowing hook
 * per-user since hooks cannot be called in loops.
 */
export function TaggerUserRow({ tagger, isLoading, isCurrentUser, onUserClick, onFollowClick }: TaggerUserRowProps) {
  const { isFollowing, isLoading: isStatusLoading } = useIsFollowing(tagger.id);

  return (
    <Organisms.UserListItem
      user={{
        id: tagger.id,
        name: tagger.name,
        avatarUrl: tagger.avatarUrl,
      }}
      variant="compact"
      isFollowing={isFollowing}
      isLoading={isLoading}
      isStatusLoading={isStatusLoading}
      isCurrentUser={isCurrentUser}
      onUserClick={onUserClick}
      onFollowClick={onFollowClick}
    />
  );
}
