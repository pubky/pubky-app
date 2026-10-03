'use client';

import { useEffect, useState } from 'react';
import { COLLECTIONS_SECTION_PAGE_SIZE } from '@/config/collections';
import { useStreamPagination } from '@/hooks/useStreamPagination/useStreamPagination';
import { parseCompositeId } from '@/models/models.utils';
import { buildPostCollectionsStreamId } from '@/models/stream/post/postStream.types';

type UsePostCollectionsOptions = {
  /**
   * Whether the surface that lists the collections is actually showing (e.g. the
   * save picker is open). While false the hook is inert and fetches nothing, so
   * a consumer mounted once per feed row does not request every row's curators.
   */
  enabled?: boolean;
};

type UsePostCollectionsResult = {
  /** Composite ids of the collections that curate the post, newest first. */
  collectionIds: string[];
  /** Whether the first page is in flight. */
  isLoading: boolean;
  /**
   * Whether a further page may hold more collections. Only true once the first
   * page has settled: the paginator reports `hasMore: true` from the moment it
   * is enabled until its first load, and that must not read as a page.
   */
  hasMore: boolean;
  isLoadingMore: boolean;
  loadMore: () => Promise<void>;
};

/**
 * Where the current lifetime of the stream stands: `idle` until the paginator
 * starts its first load, `loading` while that load runs, `settled` after it.
 * Every enable starts a new lifetime.
 */
type LoadPhase = 'idle' | 'loading' | 'settled';

/**
 * The collections that contain `postId`, read from Nexus's `post_collections`
 * stream (pubky-nexus#1067) through the shared stream layer.
 *
 * The stream is skip-paginated and served from the graph, so it is never written
 * to the local stream cache: every enabled mount pages from Nexus, which is also
 * what keeps the list current when other users edit their collections. The
 * stream layer still hydrates cache-miss collections into Dexie before returning
 * their ids, so a row can read its envelope with `usePostDetails`. Muted users'
 * and deleted collections are filtered out like on any other stream.
 *
 * A failed page is logged by `useStreamPagination` and leaves the list empty;
 * the curators list is informational, so it does not toast.
 */
export function usePostCollections(
  postId: string,
  { enabled = false }: UsePostCollectionsOptions = {},
): UsePostCollectionsResult {
  const { pubky: authorId, id } = parseCompositeId(postId);

  const { postIds, loading, loadingMore, hasMore, loadMore } = useStreamPagination({
    streamId: enabled ? buildPostCollectionsStreamId(authorId, id) : undefined,
    limit: COLLECTIONS_SECTION_PAGE_SIZE,
  });

  // `loading` flips to true only once the paginator's own effect starts the first
  // load, so the render right after enabling still shows the previous lifetime's
  // settled flags. Track the lifetime here so `hasMore` is honoured only after a
  // page of this lifetime came back, even one the stream layer filtered to nothing.
  const [phase, setPhase] = useState<LoadPhase>('idle');
  useEffect(() => {
    if (!enabled) {
      setPhase('idle');
      return;
    }
    if (loading) {
      setPhase('loading');
      return;
    }
    setPhase((current) => (current === 'loading' ? 'settled' : current));
  }, [enabled, loading]);

  return {
    collectionIds: postIds,
    isLoading: loading,
    hasMore: hasMore && phase === 'settled',
    isLoadingMore: loadingMore,
    loadMore,
  };
}
