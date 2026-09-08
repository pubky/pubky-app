'use client';

import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { TagKind } from '@/application/tag/tag.types';
import { PostController } from '@/controllers/post/post';
import { TagController } from '@/controllers/tag/tag';
import { UserController } from '@/controllers/user/user';
import { isAppError } from '@/libs/error/error.utils';
import { Logger } from '@/libs/logger/logger';
import type { Pubky } from '@/models/models.types';
import type { NexusTaggers } from '@/services/nexus/nexus.types';
import { useAuthStore } from '@/stores/auth/auth.store';

const TAGGERS_PAGE_SIZE = 50;
// Nexus rejects offsets above this limit.
const TAGGERS_MAX_SKIP = 10_000;

export type TaggersState = {
  /** Tagger IDs fetched from Nexus so far, in server order */
  ids: Pubky[];
  isLoading: boolean;
  /** Automatic loading pauses after an error until the viewer retries. */
  hasError: boolean;
  /** Whether Nexus may still have more taggers past `skip` */
  hasMore: boolean;
  /** Whether the first page has been fetched at least once */
  hasFetched: boolean;
  /** Fresh server membership, overridden only by an explicit local mutation. */
  isViewerTagger?: boolean;
};

export type TaggersStateMap = ReadonlyMap<string, TaggersState>;

/** Pagination bookkeeping stays internal to the hook. */
interface CachedTaggersState extends TaggersState {
  /** Server offset of the next page */
  skip: number;
  /** Last observed metadata count, used for refreshes rather than exhaustion. */
  totalCount?: number;
  requestId?: number;
  mutationKey?: string;
  /** Retained after a failed refresh so retry repeats the same window. */
  refreshTarget?: number;
  /** One metadata update belonging to the local write that started this refresh. */
  pendingMutationCount?: number;
}

export interface UseEntityTaggersResult {
  taggerStates: TaggersStateMap;
  /** Fetch initially or revalidate loaded rows when metadata/local mutations change. */
  loadTaggers: (label: string, totalCount?: number) => Promise<void>;
  /** Fetch the next page or retry a failed page/refresh. */
  loadMoreTaggers: (label: string) => Promise<void>;
}

interface FetchTaggerPageParams {
  taggedId: string;
  taggedKind: TagKind;
  label: string;
  skip: number;
  viewerId?: Pubky | null;
}

interface MergeTaggerIdsParams {
  /** IDs fetched from Nexus (undefined before the first page lands) */
  fetchedIds?: Pubky[];
  /** IDs from the tag's local-first preview, which reflects the viewer's own toggles immediately */
  previewIds: Pubky[];
  /** Current viewer, reconciled against `isViewerTagger` when provided */
  viewerId?: Pubky | null;
  /** Server membership or an explicit local mutation; never raw cached metadata. */
  isViewerTagger?: boolean;
}
type TaggersCache = Map<string, CachedTaggersState>;
const EMPTY_STATES: TaggersCache = new Map();

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
  const observedMutations = useLiveQuery(async () => {
    if (!taggedId || !taggedKind || !viewerId) return null;
    try {
      return {
        key: `${taggedKind}:${taggedId}:${viewerId}`,
        entries: await TagController.getViewerMutations({ taggedId, taggedKind, taggerId: viewerId }),
      };
    } catch (error) {
      if (!isAppError(error)) Logger.warn('Could not read local tag mutations', { error });
      return null;
    }
  }, [taggedId, taggedKind, viewerId]);
  const entityKey = taggedId && taggedKind ? `${taggedKind}:${taggedId}:${viewerId ?? ''}` : null;
  const mutations = observedMutations?.key === entityKey ? observedMutations.entries : undefined;
  const [cache, setCache] = useState<{ entityKey: string | null; states: TaggersCache }>({
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
  const commit = (key: string, labelKey: string, state: CachedTaggersState) => {
    const states = new Map(statesFor(key));
    states.set(labelKey, state);
    cacheRef.current = { entityKey: key, states };
    setCache(cacheRef.current);
  };
  const readMutation = (label: string) => {
    const mutation = mutations?.get(label.toLowerCase());
    const active = mutation && mutation.expiresAt > Date.now() ? mutation : undefined;
    return { mutationKey: active?.id, isViewerTagger: active?.relationship };
  };

  const fetchWindow = async (key: string, label: string, base: CachedTaggersState, refreshTarget?: number) => {
    if (!taggedId || !taggedKind) return;
    const version = versionRef.current;
    const requestId = ++requestIdRef.current;
    const labelKey = label.toLowerCase();
    const isCurrent = () => version === versionRef.current && statesFor(key).get(labelKey)?.requestId === requestId;
    commit(key, labelKey, { ...base, requestId, refreshTarget, isLoading: true, hasError: false });

    try {
      const ids = new Set(refreshTarget === undefined ? base.ids : []);
      let skip = refreshTarget === undefined ? base.skip : 0;
      let hasMore = true;
      let isViewerTagger: boolean | undefined;
      do {
        // A local viewer deletion can be indexed between two requests. Overlap
        // one entry while its marker is active, then deduplicate the boundary.
        const requestSkip = base.mutationKey && skip > 0 ? skip - 1 : skip;
        const response = await fetchTaggerPage({ taggedId, taggedKind, label, skip: requestSkip, viewerId });
        if (!isCurrent()) return;
        const pageIds = response.users;
        pageIds.forEach((id) => ids.add(id));
        const nextSkip = requestSkip + pageIds.length;
        hasMore = pageIds.length >= TAGGERS_PAGE_SIZE && nextSkip <= TAGGERS_MAX_SKIP;
        skip = nextSkip;
        const serverMembership = viewerId ? response.relationship : undefined;
        isViewerTagger = base.mutationKey ? base.isViewerTagger : serverMembership;
      } while (refreshTarget !== undefined && hasMore && skip < refreshTarget);

      commit(key, labelKey, {
        ...base,
        totalCount: statesFor(key).get(labelKey)?.totalCount,
        pendingMutationCount: undefined,
        requestId,
        ids: Array.from(ids),
        skip,
        hasMore,
        isLoading: false,
        hasError: false,
        hasFetched: true,
        refreshTarget: undefined,
        isViewerTagger,
      });
    } catch {
      if (!isCurrent()) return;
      // Preserve rows and the failed request's mode: refresh retries must start
      // at zero, ordinary page retries must keep their previous offset.
      commit(key, labelKey, {
        ...base,
        requestId,
        refreshTarget,
        isLoading: false,
        hasError: true,
        totalCount: statesFor(key).get(labelKey)?.totalCount,
        pendingMutationCount: undefined,
      });
    }
  };

  const loadTaggers = async (label: string, totalCount?: number, mutationCount?: number) => {
    if (!entityKey) return;
    const existing = statesFor(entityKey).get(label.toLowerCase());
    const mutation = readMutation(label);
    if (existing && existing.totalCount === totalCount && existing.mutationKey === mutation.mutationKey) return;
    if (
      existing?.isLoading &&
      existing.mutationKey === mutation.mutationKey &&
      existing.pendingMutationCount !== undefined &&
      existing.pendingMutationCount === totalCount
    ) {
      // The local write already started this refresh. Its matching count is
      // bookkeeping, while unrelated count changes still replace the request.
      commit(entityKey, label.toLowerCase(), { ...existing, totalCount, pendingMutationCount: undefined });
      return;
    }
    const base: CachedTaggersState = {
      ids: [],
      skip: 0,
      isLoading: false,
      hasMore: true,
      hasFetched: false,
      hasError: false,
      ...existing,
      ...mutation,
      totalCount,
      pendingMutationCount:
        mutation.mutationKey && mutation.mutationKey !== existing?.mutationKey && mutationCount !== totalCount
          ? mutationCount
          : undefined,
      isViewerTagger: mutation.isViewerTagger ?? existing?.isViewerTagger,
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
    const base = { ...existing, ...mutation, isViewerTagger: mutation.isViewerTagger ?? existing.isViewerTagger };
    const refreshTarget =
      existing.refreshTarget ?? (changed ? Math.max(TAGGERS_PAGE_SIZE, existing.skip + TAGGERS_PAGE_SIZE) : undefined);
    await fetchWindow(entityKey, label, base, refreshTarget);
  };

  const onMutationsChanged = useEffectEvent(() => {
    if (!entityKey) return;
    // Dexie observes committed writes from this tab and other open tabs alike.
    for (const [label, state] of statesFor(entityKey)) {
      if (state.mutationKey !== readMutation(label).mutationKey) {
        void loadTaggers(label, state.totalCount, mutations?.get(label)?.taggersCount);
      }
    }
  });
  useEffect(() => {
    onMutationsChanged();
  }, [mutations]);

  return { taggerStates, loadTaggers, loadMoreTaggers };
}

/**
 * Builds the tagger list to display for an expanded tag.
 *
 * Keep the preview until the first response, then use the fetched list. Viewer
 * membership comes from that response unless a recent local mutation overrides
 * it while Nexus catches up. Cached preview relationships are not authoritative.
 */
export function mergeTaggerIds({ fetchedIds, previewIds, viewerId, isViewerTagger }: MergeTaggerIdsParams): Pubky[] {
  const merged = new Set<Pubky>(fetchedIds ?? previewIds);

  if (viewerId && isViewerTagger !== undefined) {
    if (isViewerTagger) {
      merged.add(viewerId);
    } else {
      merged.delete(viewerId);
    }
  }

  return Array.from(merged);
}
