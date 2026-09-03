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

/** Sentinel epoch meaning "no read-back has emitted yet" — never matches a real list epoch. */
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

// Hoisted so the default passed to useLiveQuery is not re-allocated every render.
const INITIAL_HYDRATION_EMISSION = emptyHydrationEmission(NO_HYDRATION_EMISSION);

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
 * Users whose profile is tagged with the searched tags, in backend score
 * order, for the `/search` People section. Ids come from
 * `search/users/by_tags` (skip-paginated), are hydrated in one
 * `stream/users/by_ids` round trip, and are read back reactively from Dexie.
 * Muted users and users that fail to hydrate (e.g. deleted) are dropped.
 */
export function useSearchPeople(tags: string[], { onError }: UseSearchPeopleOptions = {}): UseSearchPeopleResult {
  // Clamp to the endpoint's hard 1-5 label bound regardless of stream config.
  const tagsKey = tags.slice(0, SEARCH_PEOPLE_MAX_TAGS).join(',');

  const [userIds, setUserIds] = useState<Pubky[]>([]);
  // Bumped only when a replaced id list is committed — never on reset or on a
  // loadMore append. The hydration gate below waits for the emission carrying
  // this epoch, so emissions for the emptied in-flight list never satisfy it.
  const [listEpoch, setListEpoch] = useState(0);
  const [skip, setSkip] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const userIdsRef = useRef<Pubky[]>([]);
  // Bumped on every tags change and on unmount; in-flight fetches compare
  // against it and drop stale results instead of committing them.
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
        // Bumped with the ids in the same render, so every earlier emission
        // carries an older epoch and the gate below re-arms.
        setListEpoch((epoch) => epoch + 1);
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

  // Reactive read-back from Dexie so follow/unfollow and late hydration update
  // without refetching. One query over all three tables keeps every emission a
  // consistent snapshot (details, counts and relationship always from the same
  // moment), and each emission records the list epoch it ran for.
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
    INITIAL_HYDRATION_EMISSION,
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

  // The live query emits a tick after it runs, so between fetch settle and the
  // first read-back the section would flash empty without this gate. It compares
  // epochs, not id arrays: a loadMore append keeps the epoch, so the previous
  // emission stays valid and the section never flips back to loading mid-append.
  // A replaced list bumps the epoch at commit, holding the gate until the
  // read-back for the new ids lands. Arrival is enough — an emission that
  // hydrated nothing means settled-and-empty, not stuck on skeletons.
  const hydrated = hydration.epoch === listEpoch;

  return { users, loading: loading || !hydrated, loadingMore, hasMore, loadMore };
}
