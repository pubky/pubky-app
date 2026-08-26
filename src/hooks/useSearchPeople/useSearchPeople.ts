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

/** Sentinel epoch: no hydration emission has arrived yet (list epochs start at 1). */
const NO_HYDRATION_EMISSION = -1;

interface HydrationEmission {
  epoch: number;
  details: Map<Pubky, NexusUserDetails>;
  counts: Map<Pubky, NexusUserCounts>;
  relationships: Map<Pubky, UserRelationshipsModelSchema>;
}

function emptyHydrationEmission(epoch: number): HydrationEmission {
  return { epoch, details: new Map(), counts: new Map(), relationships: new Map() };
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
  // Bumped only when the id list is REPLACED (tags change), never when a
  // loadMore page is appended — the hydration gate below keys on it.
  const [listEpoch, setListEpoch] = useState(0);
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
    setListEpoch((epoch) => epoch + 1);
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
  // propagate without refetching. One query over all three tables gives every
  // emission a consistent snapshot — cards can never render details with
  // zeroed counts or a missing relationship from a lagging sibling query.
  // Each emission carries the list epoch it ran for (see `hydrated` below).
  const hydration = useLiveQuery(
    async (): Promise<HydrationEmission> => {
      try {
        if (userIds.length === 0) return emptyHydrationEmission(listEpoch);
        const [details, counts, relationships] = await Promise.all([
          UserController.getManyDetails({ userIds }),
          UserController.getManyCounts({ userIds }),
          UserController.getManyRelationships({ userIds }),
        ]);
        return { epoch: listEpoch, details, counts, relationships };
      } catch (err) {
        Logger.error('[useSearchPeople] Failed to query user hydration:', err);
        return emptyHydrationEmission(listEpoch);
      }
    },
    [userIds, listEpoch],
    emptyHydrationEmission(NO_HYDRATION_EMISSION),
  );
  const userDetailsMap = hydration.details;
  const userCountsMap = hydration.counts;
  const userRelationshipsMap = hydration.relationships;

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

  // `useLiveQuery` returns its default synchronously and only fills it a tick
  // later (Dexie defers emissions), so without this gate the section would flash
  // empty — or unmount entirely — between fetch settle and the read-back
  // emission. The gate keys on the list EPOCH, not the id array identity:
  // a loadMore append keeps the epoch, so the previous emission stays valid and
  // the section never flips back to loading mid-append (new cards pop in when
  // their emission lands). A replaced list (tags change) bumps the epoch and
  // gates until the first emission for it. The gate asks whether an emission
  // arrived, NOT whether anything hydrated: a page where no id hydrates (stale
  // search index, or a swallowed `by_ids` failure) is settled and empty, and
  // must not pin the section on skeletons forever.
  const hydrated = hydration.epoch === listEpoch;

  return { users, loading: loading || !hydrated, loadingMore, hasMore, loadMore };
}
