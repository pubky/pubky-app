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
  /** Composite ids of the collections that curate the post: one page, newest first. */
  collectionIds: string[];
  /** Whether that page is in flight. */
  isLoading: boolean;
};

/**
 * A sample of the collections that contain `postId`: the first page of Nexus's
 * `post_collections` stream (pubky-nexus#1067), read through the shared stream layer.
 *
 * The stream is skip-paginated and served from the graph, so it is never written
 * to the local stream cache: every enabled mount fetches the page from Nexus, which
 * is also what keeps the sample current when other users edit their collections.
 * The stream layer still hydrates cache-miss collections into Dexie before returning
 * their ids, so a row can read its envelope with `usePostDetails`. Muted users'
 * and deleted collections are filtered out like on any other stream.
 *
 * Deliberately one page, never paginated. The raw page includes the viewer's own
 * collections, which the picker hides, and the viewer can remove the post from one
 * of them from the same picker; Nexus indexes that later, at a time this client
 * cannot see, and every later offset shifts under an offset-paginated walk. The
 * count on the save trigger carries the total; this list is a sample of it.
 *
 * A failed page is logged by `useStreamPagination` and leaves the list empty;
 * the sample is informational, so it does not toast.
 */
export function usePostCollections(
  postId: string,
  { enabled = false }: UsePostCollectionsOptions = {},
): UsePostCollectionsResult {
  const { pubky: authorId, id } = parseCompositeId(postId);

  const { postIds, loading } = useStreamPagination({
    streamId: enabled ? buildPostCollectionsStreamId(authorId, id) : undefined,
    limit: COLLECTIONS_SECTION_PAGE_SIZE,
  });

  return { collectionIds: postIds, isLoading: loading };
}
