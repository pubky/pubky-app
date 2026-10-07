'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { getModerationId } from '@/config/moderation';
import { StreamUserController } from '@/controllers/stream/users/users';
import { Logger } from '@/libs/logger/logger';
import type { Pubky } from '@/models/models.types';
import type { UserStreamCompositeId } from '@/models/stream/user/userStream.types';
import { UserStreamReach } from '@/services/nexus/nexus.types';
import { useAuthStore } from '@/stores/auth/auth.store';
import type { UseFollowingCountResult } from './useFollowingCount.types';

/**
 * useFollowingCount
 *
 * Number of accounts the viewer follows, read live from the local `<viewer>:following` stream
 * that `LocalFollowService` maintains on every follow/unfollow write. Unlike `useProfileStats`,
 * this does not depend on a cached counts row (which a brand-new account may not have yet) and
 * updates the moment a local follow lands, so it is safe to branch on right after a follow.
 *
 * The moderation bot's automatic follow is excluded: it is not a choice the user made.
 */
export function useFollowingCount(): UseFollowingCountResult {
  const viewerId = useAuthStore((state) => state.currentUserPubky);
  const moderationId = getModerationId();

  const followingIds = useLiveQuery<Pubky[] | undefined>(async () => {
    if (!viewerId) return [];
    const streamId: UserStreamCompositeId = `${viewerId}:${UserStreamReach.FOLLOWING}`;
    try {
      return await StreamUserController.getStreamUserIds(streamId);
    } catch (error) {
      Logger.error('[useFollowingCount] Failed to read following stream', { streamId, error });
      return [];
    }
  }, [viewerId]);

  if (followingIds === undefined) {
    return { followingCount: 0, isLoading: true };
  }

  const followingCount = followingIds.filter((id) => id !== moderationId).length;

  return { followingCount, isLoading: false };
}
