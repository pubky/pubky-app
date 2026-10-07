'use client';

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
   * Drops a collection the viewer just removed the post from. The raw page holds the
   * viewer's own collections too (consumers filter them out), and the stream is
   * skip-paginated: once Nexus indexes the removal every later index shifts down, so the
   * next page would step over one collection. The paginator's commit walks the offset
   * back; if Nexus has not indexed the removal by then, the next page repeats one
   * already-loaded row, which the paginator deduplicates.
   */
  removeCollection: (collectionId: string) => void;
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

  const { postIds, loading, loadingMore, hasMore, loadMore, removePostsOptimistically } = useStreamPagination({
    streamId: enabled ? buildPostCollectionsStreamId(authorId, id) : undefined,
    limit: COLLECTIONS_SECTION_PAGE_SIZE,
  });

  // The membership change has already succeeded locally when this runs, so the removal is
  // committed at once: only the committed form adjusts the skip offset.
  const removeCollection = (collectionId: string) => {
    removePostsOptimistically(collectionId).commit();
  };

  return {
    collectionIds: postIds,
    isLoading: loading,
    hasMore,
    isLoadingMore: loadingMore,
    loadMore,
    removeCollection,
  };
}
