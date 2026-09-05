'use client';

import { STARTER_PACK_SUGGESTIONS_LIMIT } from '@/config/nexus';
import { useUserStream } from '@/hooks/useUserStream/useUserStream';
import { useWhoToFollowFollowPreservation } from '@/hooks/useWhoToFollowFollowPreservation/useWhoToFollowFollowPreservation';
import { useOnboardingStore } from '@/stores/onboarding/onboarding.store';
import type { SuggestedUser, UseStarterPackSuggestionsResult } from './useStarterPackSuggestions.types';
import { resolveSuggestionsStreamId, selectMatchingTags } from './useStarterPackSuggestions.utils';

/**
 * useStarterPackSuggestions
 *
 * Suggestions for the onboarding "Follow your best matches" step. Reads the ordered interest
 * tags persisted by the tags step (never re-derived or reordered), resolves the starter pack
 * stream (or the most-active fallback with no tags), and hydrates up to
 * `STARTER_PACK_SUGGESTIONS_LIMIT` users with counts, relationships and tags.
 *
 * Nexus already excludes the viewer and already-followed users from `starter_pack`; the local
 * `excludeFollowing` filter covers the fallback stream, and followed cards are preserved in
 * place so a toggle or Follow All never removes them from the grid.
 */
export function useStarterPackSuggestions(): UseStarterPackSuggestionsResult {
  const interestTags = useOnboardingStore((state) => state.interestTags);
  const streamId = resolveSuggestionsStreamId(interestTags);

  const { preservedFollowedUserIds, handleFollowClick, isUserLoading, isFollowPending, preserveFollowedUser } =
    useWhoToFollowFollowPreservation({ resetKey: streamId });

  const { users, isLoading, error } = useUserStream({
    streamId,
    limit: STARTER_PACK_SUGGESTIONS_LIMIT,
    bufferSize: STARTER_PACK_SUGGESTIONS_LIMIT,
    refillThreshold: STARTER_PACK_SUGGESTIONS_LIMIT,
    includeCounts: true,
    includeRelationships: true,
    includeTags: true,
    excludeFollowing: true,
    preserveFollowedUserIds: preservedFollowedUserIds,
  });

  const suggestions: SuggestedUser[] = users.map((user) => ({
    ...user,
    matchingTags: selectMatchingTags(user.tags, interestTags),
  }));
  const unfollowedUsers = suggestions.filter((user) => !user.isFollowing);

  return {
    users: suggestions,
    unfollowedUsers,
    followedCount: suggestions.length - unfollowedUsers.length,
    isLoading,
    error,
    handleFollowClick,
    isUserLoading,
    isFollowPending,
    preserveFollowedUser,
  };
}
