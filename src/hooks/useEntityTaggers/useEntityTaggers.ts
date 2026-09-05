'use client';

import { useEffect, useRef, useState } from 'react';
import { TagKind } from '@/application/tag/tag.types';
import { PostController } from '@/controllers/post/post';
import { UserController } from '@/controllers/user/user';
import type { Pubky } from '@/models/models.types';
import { TAGGERS_MAX_SKIP, TAGGERS_PAGE_SIZE } from './useEntityTaggers.constants';
import type {
  FetchTaggerPageParams,
  TaggersState,
  TaggersStateMap,
  UseEntityTaggersResult,
} from './useEntityTaggers.types';

const EMPTY_STATES: TaggersStateMap = new Map();

async function fetchTaggerPage({ taggedId, taggedKind, label, skip }: FetchTaggerPageParams): Promise<Pubky[]> {
  const params = { label, skip, limit: TAGGERS_PAGE_SIZE };
  switch (taggedKind) {
    case TagKind.POST: {
      const response = await PostController.fetchTaggers({ compositeId: taggedId, ...params });
      return response.users ?? [];
    }
    case TagKind.USER: {
      const response = await UserController.fetchTaggers({ user_id: taggedId, ...params });
      return response.users ?? [];
    }
  }
}

/**
 * Fetches and caches paginated tagger lists for user or post tags on demand.
 *
 * `loadTaggers` fetches the first page when a tag is expanded and retains loaded pages
 * while local tag changes are reconciled by the caller. `loadMoreTaggers`
 * fetches the next page, typically from an infinite-scroll sentinel.
 */
export function useEntityTaggers(taggedId?: string | null, taggedKind?: TagKind | null): UseEntityTaggersResult {
  const entityKey = taggedId && taggedKind ? `${taggedKind}:${taggedId}` : null;
  // Hide the previous entity immediately, before the reset effect runs.
  const [cache, setCache] = useState<{ entityKey: string | null; states: TaggersStateMap }>({
    entityKey,
    states: EMPTY_STATES,
  });
  const cacheRef = useRef(cache);
  const requestVersionRef = useRef(0);

  useEffect(() => {
    cacheRef.current = { entityKey, states: EMPTY_STATES };
    setCache(cacheRef.current);
    return () => {
      requestVersionRef.current += 1;
    };
  }, [entityKey]);

  const taggerStates = cache.entityKey === entityKey ? cache.states : EMPTY_STATES;

  const statesFor = (key: string): TaggersStateMap =>
    cacheRef.current.entityKey === key ? cacheRef.current.states : EMPTY_STATES;

  const commit = (key: string, labelKey: string, next: TaggersState) => {
    const states = new Map(statesFor(key));
    states.set(labelKey, next);
    cacheRef.current = { entityKey: key, states };
    setCache(cacheRef.current);
  };

  const fetchPage = async (key: string, label: string, base: TaggersState) => {
    if (!taggedId || !taggedKind) return;
    const requestVersion = requestVersionRef.current;
    const labelKey = label.toLowerCase();
    commit(key, labelKey, { ...base, isLoading: true, hasError: false });

    try {
      const pageIds = await fetchTaggerPage({ taggedId, taggedKind, label, skip: base.skip });
      if (requestVersionRef.current !== requestVersion) return;

      const ids = Array.from(new Set(base.skip === 0 ? pageIds : [...base.ids, ...pageIds]));
      const skip = base.skip + pageIds.length;
      const reachedTotal = base.totalCount !== undefined && ids.length >= base.totalCount;
      const hasMore = pageIds.length >= TAGGERS_PAGE_SIZE && !reachedTotal && skip <= TAGGERS_MAX_SKIP;

      commit(key, labelKey, {
        ids,
        skip,
        isLoading: false,
        hasMore,
        hasFetched: true,
        hasError: false,
        totalCount: base.totalCount,
      });
    } catch {
      if (requestVersionRef.current !== requestVersion) return;
      // Keep what was already fetched and stay retryable from the same offset
      commit(key, labelKey, { ...base, isLoading: false, hasError: true });
    }
  };

  const loadTaggers = async (label: string, totalCount?: number) => {
    if (!entityKey) return;
    const existing = statesFor(entityKey).get(label.toLowerCase());
    if (existing?.isLoading) return;
    if (existing?.hasFetched || existing?.hasError) return;

    await fetchPage(entityKey, label, {
      ids: existing?.ids ?? [],
      skip: 0,
      isLoading: false,
      hasMore: true,
      hasFetched: false,
      hasError: false,
      totalCount,
    });
  };

  const loadMoreTaggers = async (label: string) => {
    if (!entityKey) return;
    const existing = statesFor(entityKey).get(label.toLowerCase());
    if (!existing || existing.isLoading || !existing.hasMore) return;

    await fetchPage(entityKey, label, existing);
  };

  return { taggerStates, loadTaggers, loadMoreTaggers };
}
