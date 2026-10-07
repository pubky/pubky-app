'use client';

import { useState } from 'react';
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
   * Whether a further page may hold more collections, as the paginator reports
   * it: true while the first page is still in flight too, so read it beside
   * `isLoading` before offering a "Load more" control.
   */
  hasMore: boolean;
  isLoadingMore: boolean;
  loadMore: () => Promise<void>;
  /**
   * Records that the viewer removed the post from one of their own collections. The raw
   * page holds the viewer's own collections too (consumers filter them out) and the stream
   * is skip-paginated, so once Nexus indexes the removal, at a time this hook cannot see,
   * every later index shifts down by one. Each recorded removal widens the paginator's
   * `skipOverlap`: every page from then on re-requests that many rows before its offset and
   * drops the repeats, so no curator is stepped over whenever the shift lands, including
   * under a page already in flight. An addition lands at the top and needs nothing.
   */
  recordRemoval: () => void;
};

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
  // Own removals on this post for as long as the consumer stays mounted, not per enabled
  // lifetime: a picker reopened before Nexus indexed the removal pages the old list too.
  const [removals, setRemovals] = useState(0);

  const { postIds, loading, loadingMore, hasMore, loadMore } = useStreamPagination({
    streamId: enabled ? buildPostCollectionsStreamId(authorId, id) : undefined,
    limit: COLLECTIONS_SECTION_PAGE_SIZE,
    skipOverlap: removals,
  });

  const recordRemoval = () => setRemovals((count) => count + 1);

  return {
    collectionIds: postIds,
    isLoading: loading,
    hasMore,
    isLoadingMore: loadingMore,
    loadMore,
    recordRemoval,
  };
}
