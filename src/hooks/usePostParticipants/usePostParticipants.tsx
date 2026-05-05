'use client';

import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { PostController } from '@/controllers/post/post';
import { useBulkUserAvatars } from '@/hooks/useBulkUserAvatars/useBulkUserAvatars';
import { useMutedUsers } from '@/hooks/useMutedUsers/useMutedUsers';
import { Logger } from '@/libs/logger/logger';
import type { Pubky } from '@/models/models.types';
import { parseCompositeId } from '@/models/models.utils';
import type {
  PostParticipant,
  UsePostParticipantsOptions,
  UsePostParticipantsResult,
} from './usePostParticipants.types';

const DEFAULT_LIMIT = 10;

/**
 * Hook for fetching post participants (author + reply authors).
 * Uses liveQuery to reactively get participants from local cache.
 *
 * Flow:
 * 1. Query post_relationships table for posts where replied === postId
 * 2. Extract unique author IDs from those reply composite IDs
 * 3. Use useBulkUserAvatars for user details (cache-first with Nexus fallback)
 */
export function usePostParticipants(
  postId: string | null | undefined,
  options: UsePostParticipantsOptions = {},
): UsePostParticipantsResult {
  /**
   * Mute filtering for participant lists.
   * Ensures participant avatars exclude muted users, matching timeline behavior.
   */
  const { mutedUserIdSet } = useMutedUsers();
  const { limit = DEFAULT_LIMIT } = options;

  // Parse post author from composite ID
  const authorId = useMemo(() => {
    if (!postId) return null;
    try {
      const { pubky } = parseCompositeId(postId);
      return pubky;
    } catch {
      return null;
    }
  }, [postId]);

  // Use liveQuery to get replies from local cache (reactive)
  const replyRelationships = useLiveQuery(
    async () => {
      try {
        if (!postId) return [];
        return await PostController.getReplies({ compositeId: postId });
      } catch (error) {
        Logger.error('[usePostParticipants] Failed to query post replies', { postId, error });
        return [];
      }
    },
    [postId],
    [],
  );

  // Extract unique author IDs from reply composite IDs
  const participantIds = useMemo(() => {
    const ids = new Set<string>();

    // Add post author first
    if (authorId) {
      ids.add(authorId);
    }

    // Extract authors from replies
    for (const reply of replyRelationships) {
      try {
        const { pubky } = parseCompositeId(reply.id);
        ids.add(pubky);
      } catch {
        // Skip invalid IDs
      }
    }

    // Exclude muted users from participants to keep lists consistent with other surfaces.
    const filtered = Array.from(ids).filter((id) => !mutedUserIdSet.has(id));
    return filtered.slice(0, limit);
  }, [authorId, replyRelationships, limit, mutedUserIdSet]);

  // Use existing hook for bulk user avatars and details (cache-first)
  const { usersMap, isLoading: isLoadingUsers } = useBulkUserAvatars(participantIds as Pubky[]);

  // Transform to PostParticipant format
  const participants: PostParticipant[] = useMemo(() => {
    return participantIds.map((id) => {
      const userWithAvatar = usersMap.get(id as Pubky);
      return {
        id,
        name: userWithAvatar?.name,
        avatarUrl: userWithAvatar?.avatarUrl,
        isFollowing: false, // Relationship handled by SinglePostParticipants via useIsFollowing
        counts: {
          tags: 0,
          posts: 0,
        },
      };
    });
  }, [participantIds, usersMap]);

  // Extract author from participants
  const author = useMemo(() => {
    if (!authorId) return null;
    return participants.find((p) => p.id === authorId) ?? null;
  }, [participants, authorId]);

  return {
    participants,
    author,
    isLoading: isLoadingUsers,
    error: null,
  };
}
