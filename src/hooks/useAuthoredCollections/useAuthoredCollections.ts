'use client';

import { COLLECTIONS_SECTION_PAGE_SIZE } from '@/config/collections';
import { PostController } from '@/controllers/post/post';
import { useLocalFirstQuery } from '@/hooks/useLocalFirstQuery/useLocalFirstQuery';
import { useStreamPagination } from '@/hooks/useStreamPagination/useStreamPagination';
import type { CollectionPost } from '@/models/post/collection/collectionPost.types';
import { buildAuthorCollectionsStreamId } from '@/models/stream/post/postStream.types';
import { useAuthStore } from '@/stores/auth/auth.store';

type AuthoredCollections = CollectionPost[];

type UseAuthoredCollectionsResult = {
  collections: AuthoredCollections;
  isLoading: boolean;
};

export function useAuthoredCollections(enabled = true): UseAuthoredCollectionsResult {
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);

  const { data, isLoading } = useLocalFirstQuery<AuthoredCollections>({
    queryFn: () => PostController.getAuthoredCollections({ authorId: currentUserPubky! }),
    fetchFn: () => PostController.fetchAuthoredCollections({ authorId: currentUserPubky!, viewerId: currentUserPubky }),
    deps: [currentUserPubky],
    enabled: enabled && !!currentUserPubky,
  });

  return {
    collections: data ?? [],
    isLoading,
  };
}

type UseAuthoredCollectionsPaginationOptions = {
  /**
   * Whether the paginated surface is actually mounted (e.g. the save picker is
   * open). While false the hook is inert and fetches nothing.
   */
  enabled?: boolean;
  /** Called when a page fetch fails, for surface-level UX (e.g. a toast). */
  onError?: (error: unknown) => void;
};

type UseAuthoredCollectionsPaginationResult = {
  /** Whether the stream has more collections past the ones already loaded. */
  hasMore: boolean;
  /** Whether the first page is in flight (the sentinel must stay disarmed). */
  isLoading: boolean;
  isLoadingMore: boolean;
  loadMore: () => Promise<void>;
};

/**
 * Load-more driver for the signed-in user's authored-collections stream.
 *
 * There is no second source of truth here: this paginates the same
 * `<pubky>:author:collection` stream `useAuthoredCollections` reads (and the one
 * `MyCollections` paginates). Every page it fetches is persisted into that
 * shared local stream, so the live read grows and the picker renders the new
 * rows without any extra plumbing. Page size matches the collections landing
 * (`COLLECTIONS_SECTION_PAGE_SIZE`) so both surfaces page on the same offsets.
 *
 * Inert while `enabled` is false: `streamId` is undefined, so the pagination
 * hook neither loads nor reports `hasMore`. That keeps the call unconditional
 * for a consumer mounted once per post (the picker) without paginating the
 * stream for every feed row.
 */
export function useAuthoredCollectionsPagination({
  enabled = true,
  onError,
}: UseAuthoredCollectionsPaginationOptions = {}): UseAuthoredCollectionsPaginationResult {
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  const isEnabled = enabled && Boolean(currentUserPubky);

  const { hasMore, loading, loadingMore, loadMore } = useStreamPagination({
    streamId: isEnabled && currentUserPubky ? buildAuthorCollectionsStreamId(currentUserPubky) : undefined,
    limit: COLLECTIONS_SECTION_PAGE_SIZE,
    // The picker renders this stream from `useAuthoredCollections`'s local-first read, so
    // its own load must never drop the shared row: `prepareStreamForInitialLoad` deletes an
    // expired row before fetching the replacement, which would blank the picker's cached
    // collection targets whenever Nexus is unavailable.
    preserveCachedStream: true,
    onError,
  });

  return {
    hasMore,
    isLoading: loading,
    isLoadingMore: loadingMore,
    loadMore,
  };
}
