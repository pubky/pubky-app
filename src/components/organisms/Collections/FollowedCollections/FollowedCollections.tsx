'use client';

import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Heading } from '@/atoms/Heading/Heading';
import { COLLECTIONS_SECTION_PAGE_SIZE, COLLECTIONS_SECTION_SKELETON_COUNT } from '@/config/collections';
import { BookmarkController } from '@/controllers/bookmark/bookmark';
import { PostController } from '@/controllers/post/post';
import { StreamPostsController } from '@/controllers/stream/posts/posts';
import { Logger } from '@/libs/logger/logger';
import { isPostDeleted } from '@/libs/utils/utils';
import { parseCompositeId } from '@/models/models.utils';
import { buildFollowedCollectionsStreamId } from '@/models/stream/post/postStream.types';
import { AvatarStack } from '@/molecules/AvatarStack/AvatarStack';
import { AvatarStackSkeleton } from '@/molecules/AvatarStack/AvatarStack.skeleton';
import { useToast } from '@/molecules/Toaster/use-toast';
import { CollectionCard } from '@/organisms/Collections/CollectionCard/CollectionCard';
import { CollectionCardSkeleton } from '@/organisms/Collections/CollectionCard/CollectionCard.skeleton';
import { uniqueAuthors } from '@/organisms/Collections/collections.utils';
import { useAuthStore } from '@/stores/auth/auth.store';

const COLLECTION_KIND_STRING = 'collection';

interface SeedCursor {
  lastPostId: string | undefined;
  streamTail: number;
}

const EMPTY_CURSOR: SeedCursor = { lastPostId: undefined, streamTail: 0 };
const EMPTY_IDS: string[] = [];

/**
 * FollowedCollections
 *
 * "Followed Collections" section. Two-track architecture:
 *
 *   1. **Seed track** — paginated stream fetch on
 *      `timeline:bookmarks:collection`. We only care about the persist
 *      side effect: each slice writes viewer bookmark records + post
 *      details into Dexie, broadening the live query's result set.
 *
 *   2. **Render track** — `useLiveQuery` joining the local `bookmarks`
 *      table with `post_details.kind === 'collection'`. Sorted by
 *      bookmark `created_at` desc. Sliced to the current `pagesShown`
 *      window so the visible count grows in lockstep with "Show more"
 *      clicks (always a multiple of `COLLECTIONS_SECTION_PAGE_SIZE`).
 *
 * Live-reactive: a Follow / Unfollow performed anywhere in the app
 * pushes a card into / out of this section without a reload.
 */
export function FollowedCollections() {
  const t = useTranslations('collections');
  const { toast } = useToast();
  // Gate the seed fetch on auth hydration. `StreamPostsController.getOrFetchStreamSlice`
  // reads `viewerId` from the auth store synchronously, and the bookmarks-collection
  // Nexus endpoint needs the viewer to resolve. If we fire pre-hydration the slice
  // returns empty / errors, `reachedEnd` flips to `true`, and the seed never re-fires
  // (so the user gets no fresh bookmarks until a manual refresh).
  const hasHydrated = useAuthStore((state) => state.hasHydrated);
  const streamId = buildFollowedCollectionsStreamId();

  const [pagesShown, setPagesShown] = useState(1);
  const cursorRef = useRef<SeedCursor>(EMPTY_CURSOR);
  const [reachedEnd, setReachedEnd] = useState(false);
  const [seedLoading, setSeedLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const initialFetchRef = useRef(false);

  /** Pull one more slice of the bookmarks-collection stream. */
  const fetchNextSeedSlice = async ({ isInitial }: { isInitial: boolean }) => {
    try {
      if (isInitial) {
        await StreamPostsController.prepareStreamForInitialLoad({ streamId });
        const cachedTail = await StreamPostsController.getCachedLastPostTimestamp({ streamId });
        cursorRef.current = { lastPostId: undefined, streamTail: cachedTail };
      }

      const result = await StreamPostsController.getOrFetchStreamSlice({
        streamId,
        lastPostId: cursorRef.current.lastPostId,
        streamTail: cursorRef.current.streamTail,
        limit: COLLECTIONS_SECTION_PAGE_SIZE,
      });

      const nextLastId = result.nextPageIds[result.nextPageIds.length - 1];
      cursorRef.current = {
        lastPostId: nextLastId ?? cursorRef.current.lastPostId,
        streamTail: result.nextCursor ?? cursorRef.current.streamTail,
      };
      setReachedEnd(result.reachedEnd === true);
    } catch (error) {
      Logger.error('[FollowedCollections] Failed to seed bookmark slice', { error });
      // Mirror `MyCollections`' `useStreamPagination({ onError })` toast so the
      // three Collections sections fail consistently from the user's POV.
      toast({
        variant: 'error',
        description: t('loadFailed'),
      });
      setReachedEnd(true);
    }
  };

  // Initial seed fetch — once per mount, AFTER auth hydrates so the
  // bookmarks-collection slice request resolves with the real viewer pubky.
  useEffect(() => {
    if (!hasHydrated) return;
    if (initialFetchRef.current) return;
    initialFetchRef.current = true;
    setSeedLoading(true);
    void fetchNextSeedSlice({ isInitial: true }).finally(() => setSeedLoading(false));
    // `fetchNextSeedSlice` is intentionally excluded: it is recreated on every
    // render, so including it would re-fire this once-per-mount seed effect and
    // re-trigger the seed fetch on every state update. `hasHydrated` is the only
    // intended trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasHydrated]);

  // Visible-count cap; live query slices its result to this many rows.
  const visibleLimit = pagesShown * COLLECTIONS_SECTION_PAGE_SIZE;

  // Live query: bookmarks table ∩ collection-kind post details, newest first.
  // Both reads go through controllers (`BookmarkController.getAll()` /
  // `PostController.getDetailsByIds()`) which delegate down the
  // Application/Service/Model chain, so all data access stays inside the
  // layered architecture per AGENTS.md. Dexie's live-query observer still picks
  // up changes because the underlying reads go through the same Dexie instance.
  // `getDetailsByIds` preserves bookmark order, so the result aligns to `ids` by index.
  const visibleIds =
    useLiveQuery(async () => {
      try {
        const ids = await BookmarkController.getAll();
        if (ids.length === 0) return EMPTY_IDS;
        const details = await PostController.getDetailsByIds({ compositeIds: ids });
        const collectionIds: string[] = [];
        for (let i = 0; i < ids.length; i += 1) {
          const detail = details[i];
          // Filter out deleted collections (content === '[DELETED]'). Mirrors
          // the timeline's `isPostDeleted` guard in `useVisualFeedTiles`. The
          // live query observes `post_details`, so deleting flips visibility
          // immediately without a refresh.
          if (detail && detail.kind === COLLECTION_KIND_STRING && !isPostDeleted(detail.content)) {
            collectionIds.push(ids[i]);
            if (collectionIds.length >= visibleLimit) break;
          }
        }
        return collectionIds;
      } catch (error) {
        Logger.error('[FollowedCollections] Live query failed', { error });
        return EMPTY_IDS;
      }
    }, [visibleLimit]) ?? EMPTY_IDS;

  const handleShowMore = () => {
    if (loadingMore) return;
    setLoadingMore(true);
    setPagesShown((p) => p + 1);
    void fetchNextSeedSlice({ isInitial: false }).finally(() => setLoadingMore(false));
  };

  const headerPubkys = uniqueAuthors(visibleIds);

  const showShowMore = !reachedEnd && !seedLoading;
  // Skeleton only while the seed is in flight AND we have no cached bookmarks
  // yet — warm-cache visits paint the live-query result immediately.
  const showSkeletons = seedLoading && visibleIds.length === 0;

  // Hide the entire section (title + empty copy) when there is nothing to show.
  if (!seedLoading && visibleIds.length === 0) {
    return null;
  }

  return (
    <Container overrideDefaults data-cy="followed-collections-section" className="flex w-full flex-col gap-4">
      <Container overrideDefaults className="flex items-center gap-3">
        <Heading level={2} size="lg" className="font-light text-muted-foreground">
          {t('followed.title')}
        </Heading>
        {showSkeletons ? <AvatarStackSkeleton count={3} size="md" /> : <AvatarStack pubkys={headerPubkys} />}
      </Container>

      {showSkeletons ? (
        <Container overrideDefaults className="grid w-full grid-cols-1 gap-3 lg:grid-cols-2 lg:gap-6">
          {Array.from({ length: COLLECTIONS_SECTION_SKELETON_COUNT }).map((_, index) => (
            <CollectionCardSkeleton key={`followed-collections-skeleton-${index}`} />
          ))}
        </Container>
      ) : (
        <Container overrideDefaults className="grid w-full grid-cols-1 gap-3 lg:grid-cols-2 lg:gap-6">
          {visibleIds.map((compositeId) => {
            const { pubky, id } = parseCompositeId(compositeId);
            // Every card in this section is, by definition, a followed
            // collection. Seed the bookmark hook so the CTA renders as
            // "Unfollow" on the first paint instead of briefly flashing
            // "Follow" while the async existence check resolves.
            return <CollectionCard key={compositeId} authorPubky={pubky} postId={id} initialIsBookmarked />;
          })}
        </Container>
      )}

      {showShowMore && (
        <Container overrideDefaults className="flex w-full justify-center">
          <Button variant="default" size="sm" onClick={handleShowMore} disabled={loadingMore}>
            {loadingMore && <Loader2 className="size-4 animate-spin" />}
            {t('showMore')}
          </Button>
        </Container>
      )}
    </Container>
  );
}
