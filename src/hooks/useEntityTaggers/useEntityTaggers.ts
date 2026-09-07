'use client';

import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { TagKind } from '@/application/tag/tag.types';
import { PostController } from '@/controllers/post/post';
import { TagController } from '@/controllers/tag/tag';
import { UserController } from '@/controllers/user/user';
import { HttpMethod } from '@/libs/http/http.types';
import type { NexusTaggers } from '@/services/nexus/nexus.types';
import { useAuthStore } from '@/stores/auth/auth.store';
import { TAGGERS_MAX_SKIP, TAGGERS_PAGE_SIZE } from './useEntityTaggers.constants';
import type {
  FetchTaggerPageParams,
  TaggersState,
  TaggersStateMap,
  UseEntityTaggersResult,
} from './useEntityTaggers.types';

const EMPTY_STATES: TaggersStateMap = new Map();

async function fetchTaggerPage({
  taggedId,
  taggedKind,
  label,
  skip,
  viewerId,
}: FetchTaggerPageParams): Promise<NexusTaggers> {
  const params = { label, skip, limit: TAGGERS_PAGE_SIZE };
  switch (taggedKind) {
    case TagKind.POST:
      return PostController.fetchTaggers({ compositeId: taggedId, ...params, ...(viewerId && { viewerId }) });
    case TagKind.USER:
      return UserController.fetchTaggers({ user_id: taggedId, ...params, ...(viewerId && { viewer_id: viewerId }) });
  }
}

/**
 * Pages on demand, keeping displayed rows while changed metadata revalidates the
 * loaded window. Counts are refresh hints; only the endpoint can exhaust a list.
 */
export function useEntityTaggers(taggedId?: string | null, taggedKind?: TagKind | null): UseEntityTaggersResult {
  const viewerId = useAuthStore((state) => state.currentUserPubky);
  const entityKey = taggedId && taggedKind ? `${taggedKind}:${taggedId}:${viewerId ?? ''}` : null;
  const [cache, setCache] = useState<{ entityKey: string | null; states: TaggersStateMap }>({
    entityKey,
    states: EMPTY_STATES,
  });
  const cacheRef = useRef(cache);
  const versionRef = useRef(0);
  const requestIdRef = useRef(0);

  useEffect(() => {
    cacheRef.current = { entityKey, states: EMPTY_STATES };
    setCache(cacheRef.current);
    return () => {
      versionRef.current += 1;
    };
  }, [entityKey]);

  const taggerStates = cache.entityKey === entityKey ? cache.states : EMPTY_STATES;
  const statesFor = (key: string) => (cacheRef.current.entityKey === key ? cacheRef.current.states : EMPTY_STATES);
  const commit = (key: string, labelKey: string, state: TaggersState) => {
    const states = new Map(statesFor(key));
    states.set(labelKey, state);
    cacheRef.current = { entityKey: key, states };
    setCache(cacheRef.current);
  };
  const readMutation = (label: string) => {
    const marker =
      taggedId && viewerId ? TagController.getViewerMutation({ taggedId, taggerId: viewerId, label }) : null;
    return {
      mutationKey: marker ? `${marker.ts}:${marker.op}` : undefined,
      viewerOverride: marker ? marker.op === HttpMethod.PUT : undefined,
    };
  };

  const fetchWindow = async (key: string, label: string, base: TaggersState, refreshTarget?: number) => {
    if (!taggedId || !taggedKind) return;
    const version = versionRef.current;
    const requestId = ++requestIdRef.current;
    const labelKey = label.toLowerCase();
    const isCurrent = () => version === versionRef.current && statesFor(key).get(labelKey)?.requestId === requestId;
    commit(key, labelKey, { ...base, requestId, refreshTarget, isLoading: true, hasError: false });

    try {
      const ids = new Set(refreshTarget === undefined ? base.ids : []);
      let skip = refreshTarget === undefined ? base.skip : 0;
      const target = refreshTarget ?? skip + TAGGERS_PAGE_SIZE;
      let hasMore = true;
      let serverRelationship = base.serverRelationship;
      do {
        // A local viewer deletion can be indexed between two requests. Overlap
        // one entry while its marker is active, then deduplicate the boundary.
        const requestSkip = base.mutationKey && skip > 0 ? skip - 1 : skip;
        const response = await fetchTaggerPage({ taggedId, taggedKind, label, skip: requestSkip, viewerId });
        if (!isCurrent()) return;
        const pageIds = response.users ?? [];
        pageIds.forEach((id) => ids.add(id));
        const nextSkip = requestSkip + pageIds.length;
        hasMore = pageIds.length >= TAGGERS_PAGE_SIZE && nextSkip > skip && nextSkip <= TAGGERS_MAX_SKIP;
        skip = nextSkip;
        serverRelationship = viewerId ? response.relationship : undefined;
      } while (refreshTarget !== undefined && hasMore && skip < target);

      commit(key, labelKey, {
        ...base,
        requestId,
        ids: Array.from(ids),
        skip,
        hasMore,
        isLoading: false,
        hasError: false,
        hasFetched: true,
        refreshTarget: undefined,
        serverRelationship,
        isViewerTagger: base.viewerOverride ?? serverRelationship,
      });
    } catch {
      if (!isCurrent()) return;
      // Preserve rows and the failed request's mode: refresh retries must start
      // at zero, ordinary page retries must keep their previous offset.
      commit(key, labelKey, { ...base, requestId, refreshTarget, isLoading: false, hasError: true });
    }
  };

  const loadTaggers = async (label: string, totalCount?: number) => {
    if (!entityKey) return;
    const existing = statesFor(entityKey).get(label.toLowerCase());
    const mutation = readMutation(label);
    if (existing && existing.totalCount === totalCount && existing.mutationKey === mutation.mutationKey) return;
    const base: TaggersState = {
      ids: [],
      skip: 0,
      isLoading: false,
      hasMore: true,
      hasFetched: false,
      hasError: false,
      ...existing,
      ...mutation,
      totalCount,
      isViewerTagger: mutation.viewerOverride ?? existing?.serverRelationship,
    };
    await fetchWindow(entityKey, label, base, Math.max(TAGGERS_PAGE_SIZE, base.skip));
  };

  const loadMoreTaggers = async (label: string) => {
    if (!entityKey) return;
    const existing = statesFor(entityKey).get(label.toLowerCase());
    if (!existing || existing.isLoading) return;
    const mutation = readMutation(label);
    const changed = existing.mutationKey !== mutation.mutationKey;
    if (!existing.hasMore && !existing.hasError && !changed) return;
    const base = { ...existing, ...mutation, isViewerTagger: mutation.viewerOverride ?? existing.serverRelationship };
    const refreshTarget =
      existing.refreshTarget ?? (changed ? Math.max(TAGGERS_PAGE_SIZE, existing.skip + TAGGERS_PAGE_SIZE) : undefined);
    await fetchWindow(entityKey, label, base, refreshTarget);
  };

  const onViewerMutation = useEffectEvent((mutation: Parameters<typeof TagController.getViewerMutation>[0]) => {
    if (!entityKey || mutation.taggedId !== taggedId || mutation.taggerId !== viewerId) return;
    const existing = statesFor(entityKey).get(mutation.label.toLowerCase());
    // Mutations (including no-op database rollbacks) update an open list even
    // when its cached count does not change. Unopened tags stay on demand.
    if (existing) void loadTaggers(mutation.label, existing.totalCount);
  });
  useEffect(() => TagController.subscribeViewerMutations((mutation) => onViewerMutation(mutation)), []);

  return { taggerStates, loadTaggers, loadMoreTaggers };
}
