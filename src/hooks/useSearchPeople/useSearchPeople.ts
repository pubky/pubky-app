'use client';

import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { SEARCH_PEOPLE_MAX_TAGS, SEARCH_PEOPLE_PAGE_SIZE } from '@/config/search';
import { FileController } from '@/controllers/file/file';
import { SearchController } from '@/controllers/search/search';
import { StreamUserController } from '@/controllers/stream/users/users';
import { UserController } from '@/controllers/user/user';
import { useMutedUsers } from '@/hooks/useMutedUsers/useMutedUsers';
import { Logger } from '@/libs/logger/logger';
import type { Pubky } from '@/models/models.types';
import type { UserRelationshipsModelSchema } from '@/models/user/relationships/userRelationships.schema';
import type { UserListItemData } from '@/organisms/UserListItem/UserListItem.types';
import type { NexusUserCounts, NexusUserDetails } from '@/services/nexus/nexus.types';
import type { TUserTagSearchResult } from '@/services/nexus/search/search.types';

interface UseSearchPeopleOptions {
  onError?: (error: unknown) => void;
}

interface UseSearchPeopleResult {
  users: UserListItemData[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  loadMore: () => Promise<void>;
}

/** Response ids in order, with duplicates within the same page dropped. */
function uniquePageIds(results: TUserTagSearchResult[]): Pubky[] {
  const seen = new Set<Pubky>();
  const ids: Pubky[] = [];
  for (const { user_id } of results) {
    if (!seen.has(user_id)) {
      seen.add(user_id);
      ids.push(user_id);
    }
  }
  return ids;
}

/**
 * useSearchPeople
 *
 * Users whose profile is tagged with the searched tags, in backend score
 * order, for the `/search` People section. Ids come from
 * `search/users/by_tags` (skip-paginated), get hydrated in one round trip via
 * `stream/users/by_ids`, and are read back reactively from Dexie. Users that
 * fail to hydrate (e.g. deleted) and muted users are dropped from the result.
 */
export function useSearchPeople(tags: string[], { onError }: UseSearchPeopleOptions = {}): UseSearchPeopleResult {
  // Clamp to the endpoint's hard 1-5 label bound regardless of stream config.
  const tagsKey = tags.slice(0, SEARCH_PEOPLE_MAX_TAGS).join(',');

  const [userIds, setUserIds] = useState<Pubky[]>([]);
  const [skip, setSkip] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const userIdsRef = useRef<Pubky[]>([]);
  // Bumped on every tags change (and unmount) so any in-flight fetch —
  // initial or loadMore — is discarded instead of committing stale state.
  const generationRef = useRef(0);
  // Keep the latest callback without retriggering the fetch effect.
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const { isMuted } = useMutedUsers();

  // Initial page — reruns from scratch whenever the searched tags change.
  useEffect(() => {
    generationRef.current += 1;
    const generation = generationRef.current;

    userIdsRef.current = [];
    setUserIds([]);
    setSkip(0);

    if (!tagsKey) {
      setLoading(false);
      setHasMore(false);
      return;
    }

    setLoading(true);
    setHasMore(true);

    const run = async () => {
      try {
        const results = await SearchController.fetchUsersByTags({
          tags: tagsKey,
          skip: 0,
          limit: SEARCH_PEOPLE_PAGE_SIZE,
        });
        if (generation !== generationRef.current) return;

        const ids = uniquePageIds(results);
        if (ids.length > 0) {
          // One POST `by_ids` fills details/counts/tags/relationship in Dexie.
          await StreamUserController.getOrFetchUsers({ userIds: ids });
        }
        if (generation !== generationRef.current) return;

        userIdsRef.current = ids;
        setUserIds(ids);
        // Cursor advances by the raw response length, not the deduped one.
        setSkip(results.length);
        setHasMore(results.length >= SEARCH_PEOPLE_PAGE_SIZE);
      } catch (err) {
        if (generation !== generationRef.current) return;
        setHasMore(false);
        Logger.error('[useSearchPeople] Initial fetch failed:', err);
        onErrorRef.current?.(err);
      } finally {
        if (generation === generationRef.current) {
          setLoading(false);
        }
      }
    };

    void run();
    return () => {
      generationRef.current += 1;
    };
  }, [tagsKey]);

  const loadMore = async () => {
    if (loading || loadingMore || !hasMore || !tagsKey) return;

    const generation = generationRef.current;
    setLoadingMore(true);
    try {
      const results = await SearchController.fetchUsersByTags({
        tags: tagsKey,
        skip,
        limit: SEARCH_PEOPLE_PAGE_SIZE,
      });
      if (generation !== generationRef.current) return;

      if (results.length === 0) {
        setHasMore(false);
        return;
      }

      const existingIds = new Set(userIdsRef.current);
      const newUniqueIds = uniquePageIds(results).filter((id) => !existingIds.has(id));
      if (newUniqueIds.length > 0) {
        await StreamUserController.getOrFetchUsers({ userIds: newUniqueIds });
      }
      if (generation !== generationRef.current) return;

      // Advance by the raw returned length, not the deduped one, so a cursor
      // drifting against a mutating index cannot stall in place.
      setSkip(skip + results.length);
      setHasMore(results.length >= SEARCH_PEOPLE_PAGE_SIZE);
      userIdsRef.current = [...userIdsRef.current, ...newUniqueIds];
      setUserIds(userIdsRef.current);
    } catch (err) {
      if (generation !== generationRef.current) return;
      setHasMore(false);
      Logger.error('[useSearchPeople] Load more failed:', err);
      onErrorRef.current?.(err);
    } finally {
      if (generation === generationRef.current) {
        setLoadingMore(false);
      }
    }
  };

  // Reactive read-back from Dexie so follow/unfollow and late hydration
  // propagate without refetching.
  const userDetailsMap = useLiveQuery(
    async () => {
      try {
        if (userIds.length === 0) return new Map<Pubky, NexusUserDetails>();
        return await UserController.getManyDetails({ userIds });
      } catch (err) {
        Logger.error('[useSearchPeople] Failed to query user details:', err);
        return new Map<Pubky, NexusUserDetails>();
      }
    },
    [userIds],
    new Map<Pubky, NexusUserDetails>(),
  );

  const userCountsMap = useLiveQuery(
    async () => {
      try {
        if (userIds.length === 0) return new Map<Pubky, NexusUserCounts>();
        return await UserController.getManyCounts({ userIds });
      } catch (err) {
        Logger.error('[useSearchPeople] Failed to query user counts:', err);
        return new Map<Pubky, NexusUserCounts>();
      }
    },
    [userIds],
    new Map<Pubky, NexusUserCounts>(),
  );

  const userRelationshipsMap = useLiveQuery(
    async () => {
      try {
        if (userIds.length === 0) return new Map<Pubky, UserRelationshipsModelSchema>();
        return await UserController.getManyRelationships({ userIds });
      } catch (err) {
        Logger.error('[useSearchPeople] Failed to query user relationships:', err);
        return new Map<Pubky, UserRelationshipsModelSchema>();
      }
    },
    [userIds],
    new Map<Pubky, UserRelationshipsModelSchema>(),
  );

  const users = userIds
    .filter((id) => !isMuted(id))
    .map((id): UserListItemData | null => {
      const details = userDetailsMap.get(id);
      // Ids that never hydrated (e.g. deleted users) are dropped, not rendered.
      if (!details) return null;
      const counts = userCountsMap.get(id);
      const relationship = userRelationshipsMap.get(id);
      return {
        id,
        name: details.name,
        avatarUrl: details.image ? FileController.getAvatarUrl(id) : null,
        stats: {
          tags: counts?.tagged ?? 0,
          posts: counts?.posts ?? 0,
        },
        isFollowing: relationship?.following ?? false,
      };
    })
    .filter((user): user is UserListItemData => user !== null);

  // `useLiveQuery` returns its default empty Map synchronously and only fills
  // it a tick later (Dexie defers emissions), so without this gate the section
  // would flash empty — or unmount entirely — between fetch settle and the
  // read-back emission. Same guard as useUserStream's hydration flags.
  const detailsHydrated = userIds.length === 0 || userIds.some((id) => userDetailsMap.has(id));

  return { users, loading: loading || !detailsHydrated, loadingMore, hasMore, loadMore };
}
