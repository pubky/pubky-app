'use client';

import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Loader2 } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Heading } from '@/atoms/Heading/Heading';
import { Typography } from '@/atoms/Typography/Typography';
import { COLLECTIONS_SECTION_PAGE_SIZE, COLLECTIONS_SECTION_SKELETON_COUNT } from '@/config/collections';
import { BookmarkController } from '@/controllers/bookmark/bookmark';
import { PostController } from '@/controllers/post/post';
import { StreamPostsController } from '@/controllers/stream/posts/posts';
import { resolveResumeAnchor } from '@/controllers/stream/posts/posts.utils';
import { Logger } from '@/libs/logger/logger';
import { parseCollectionContent } from '@/libs/post/collectionContent';
import { isPostDeleted } from '@/libs/utils/utils';
import { parseCompositeId } from '@/models/models.utils';
import { buildDiscoverCollectionsStreamId } from '@/models/stream/post/postStream.types';
import { AvatarStack } from '@/molecules/AvatarStack/AvatarStack';
import { AvatarStackSkeleton } from '@/molecules/AvatarStack/AvatarStack.skeleton';
import { toast } from '@/molecules/Toaster/toast';
import { CollectionCard } from '@/organisms/Collections/CollectionCard/CollectionCard';
import { CollectionCardSkeleton } from '@/organisms/Collections/CollectionCard/CollectionCard.skeleton';
import { uniqueAuthors } from '@/organisms/Collections/collections.utils';
import { useAuthStore } from '@/stores/auth/auth.store';

interface DiscoverCursor {
  lastPostId: string | undefined;
  // For the engagement-sorted Discover stream (`total_engagement:all:collection`)
  // `streamTail` is a *skip offset* — the raw count of post IDs already pulled
  // from the backend — NOT a timestamp / engagement score. It is threaded back
  // from each slice as `result.nextCursor`, advanced by the stream layer by raw
  // backend count so heavy filtering can never stall pagination.
  streamTail: number;
}

const EMPTY_CURSOR: DiscoverCursor = { lastPostId: undefined, streamTail: 0 };

/** `initial`: first page behind skeletons; `more` / `reload`: Show More disabled. */
type LoadPhase = 'idle' | 'initial' | 'more' | 'reload';

/**
 * DiscoverCollections
 *
 * "Discover Collections" section. Pulls the global engagement-sorted
 * collection-kind post stream (`total_engagement:all:collection`), which
 * excludes:
 *   - The current user's own collections.
 *   - Collections the current user has already bookmarked (followed).
 *   - Collections whose local PostDetails is tombstoned (`'[DELETED]'`).
 *   - Collections with zero items (nothing to discover).
 *
 * Filtering happens in two layers:
 *
 *   1. **Stream-layer fetch-time filter** — own / bookmarked / deleted /
 *      empty are dropped inside `getOrFetchStreamSlice` for this stream
 *      (see `PostStreamApplication.filterDiscoverOwnAndBookmarked` and the
 *      Discover branch of `filterStreamPosts`). The queue backfills to the
 *      requested page size while advancing the skip cursor by the *raw*
 *      backend count, so `result.nextPageIds` arrives already filtered and
 *      a heavily-filtered region can never make Show More re-request the
 *      same slice.
 *
 *   2. **Render-time subtractive overlay** — `useLiveQuery` subscribes
 *      to the local `bookmarks` table (and `post_details` for deletions /
 *      emptied collections) and yields sets of ids to hide. `displayIds`
 *      is `visibleIds` minus those sets. The overlay is monotonically
 *      subtractive (it can only remove, never add unfiltered cards), so it
 *      cannot reintroduce the unfiltered-flash class of bug fixed in
 *      QA #1/#3. Its job is to keep Discover semantically honest: when the
 *      user follows a card — here, from another section, or from a future
 *      surface — the card disappears from Discover without a reload.
 *
 *   3. **Unfollow reload** — a collection that was already followed when
 *      its page loaded was dropped by the fetch-time filter, so it is not in
 *      `visibleIds` and the subtractive overlay cannot bring it back. When a
 *      bookmark disappears for a collection that is not loaded, the depth
 *      already loaded is re-pulled from offset 0 and swapped in without
 *      clearing the grid, returning the collection at its popularity
 *      position. Every load is ordered by one generation counter (the newest
 *      reset wins, see `generationRef`), and a failed reload is retried by
 *      the next Show More click (offered even at the stream end).
 *
 * If the user follows every visible card mid-session, the grid empties
 * but Show More remains until `reachedEnd` (the global engagement stream
 * is exhausted). This is intentional: it reads as "you've followed
 * everything we showed you — click for more candidates."
 *
 * When a Show More click yields nothing new even though the stream is not
 * exhausted (the stream layer's bounded backfill scanned its cap worth of
 * raw posts and filtering removed them all), we surface a toast so the
 * click gets feedback instead of silently rendering nothing.
 */
export function DiscoverCollections() {
  // The stream layer filters own collections against the viewer read from the
  // auth store, so a viewer switch must reset and refetch (effect dep below).
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  // Gate the initial fetch on auth hydration so we never fire a fetch under a
  // transient `currentUserPubky === null` and then re-fire it with the real
  // pubky once the store rehydrates — that race surfaces as a flash of
  // unfiltered cards followed by the empty state.
  const hasHydrated = useAuthStore((state) => state.hasHydrated);
  const streamId = buildDiscoverCollectionsStreamId();

  const [visibleIds, setVisibleIds] = useState<string[]>([]);
  const cursorRef = useRef<DiscoverCursor>(EMPTY_CURSOR);
  const [reachedEnd, setReachedEnd] = useState(false);
  // What the section is fetching. Each load sets it when it starts and only a
  // current load (see `generationRef`) returns it to idle, so a superseded
  // load can never leave a spinner or skeleton stuck.
  const [phase, setPhase] = useState<LoadPhase>('initial');
  const loading = phase === 'initial';
  const loadingMore = phase === 'more' || phase === 'reload';

  // Ref of currently-visible IDs, read inside the async fetch so appends can
  // dedup without re-creating the function on every successful append. Written
  // from an effect (not during render) for the React Compiler `refs` rule; the
  // fetch reads it after an await, i.e. after the commit that updated it.
  const visibleIdsRef = useRef<string[]>([]);
  useEffect(() => {
    visibleIdsRef.current = visibleIds;
  }, [visibleIds]);

  // One rule orders every load: the newest reset wins. A reset (initial load,
  // viewer switch, unfollow reload) bumps the generation, and so does unmount;
  // Show More runs within the current one. After every await a load checks
  // that its generation is still current and otherwise drops its result, so
  // no two loads can interleave their writes to the list, cursor or phase.
  const generationRef = useRef(0);
  // A failed unfollow reload is owed: the next Show More click retries it
  // instead of appending past the collection it should have returned.
  const reloadOwedRef = useRef(false);

  /**
   * Reset: re-pull the stream from offset 0 through the stream layer, whose
   * fetch-time filter reads the current bookmarks.
   *
   * - `keepGrid: false` (mount, viewer switch): clear the grid and load the
   *   first page behind skeletons.
   * - `keepGrid: true` (unfollow reload): pull every page loaded so far (up to
   *   the current raw skip offset) and swap the result in without clearing the
   *   grid. It supersedes an in-flight Show More, whose page is dropped; the
   *   next click resumes from the reloaded offset.
   */
  const reset = async ({ keepGrid }: { keepGrid: boolean }) => {
    generationRef.current += 1;
    const generation = generationRef.current;
    const isCurrent = () => generationRef.current === generation;
    reloadOwedRef.current = false;
    const loadedTail = keepGrid ? cursorRef.current.streamTail : 0;
    if (!keepGrid) {
      setVisibleIds([]);
      cursorRef.current = EMPTY_CURSOR;
      setReachedEnd(false);
    }
    setPhase(keepGrid ? 'reload' : 'initial');

    try {
      // Clear stale cache + sync any unread posts in case the engagement
      // stream changed. Mirrors `useStreamPagination.fetchStreamSlice(isInitialLoad=true)`.
      // Skip-paginated streams always start at offset 0.
      await StreamPostsController.prepareStreamForInitialLoad({ streamId });
      let cursor = EMPTY_CURSOR;
      let reachedStreamEnd = false;
      const ids: string[] = [];
      const seen = new Set<string>();
      do {
        if (!isCurrent()) return;
        const result = await StreamPostsController.getOrFetchStreamSlice({
          streamId,
          lastPostId: cursor.lastPostId,
          streamTail: cursor.streamTail,
          limit: COLLECTIONS_SECTION_PAGE_SIZE,
        });
        for (const id of result.nextPageIds) {
          if (!seen.has(id)) {
            seen.add(id);
            ids.push(id);
          }
        }
        const nextTail = result.nextCursor ?? cursor.streamTail;
        const advanced = nextTail > cursor.streamTail;
        // Anchor is inert for this skip stream's offset pagination, but resolves the
        // same way as every other feed so the semantics stay uniform.
        cursor = { lastPostId: resolveResumeAnchor(result) ?? cursor.lastPostId, streamTail: nextTail };
        reachedStreamEnd = result.reachedEnd === true;
        if (!advanced) break;
      } while (!reachedStreamEnd && cursor.streamTail < loadedTail);
      if (!isCurrent()) return;

      cursorRef.current = cursor;
      setReachedEnd(reachedStreamEnd);
      setVisibleIds(ids);
    } catch (error) {
      if (!isCurrent()) return;
      if (keepGrid) {
        // Keep the grid (the failed request's `Err.*` factory already logged
        // it) and owe the reload, so the collection does not stay missing.
        // Show More must be offered even at the stream end: its click runs the
        // owed reload.
        reloadOwedRef.current = true;
        setReachedEnd(false);
        return;
      }
      Logger.error('[DiscoverCollections] Failed to fetch slice', { error });
      // Mirror `MyCollections`' `useStreamPagination({ onError })` toast so the
      // three Collections sections fail consistently from the user's POV.
      toast({
        variant: 'error',
        description: 'Failed to load collections. Please try again.',
      });
      // Give up on this load so the spinner clears.
      setReachedEnd(true);
    } finally {
      if (isCurrent()) {
        setPhase('idle');
      }
    }
  };

  /**
   * Show More: pull the next post-filter slice from the raw skip offset and
   * append it. Runs within the current generation, so a reset started
   * meanwhile drops its result.
   */
  const showMore = async () => {
    if (reloadOwedRef.current) {
      void reset({ keepGrid: true });
      return;
    }
    const generation = generationRef.current;
    const isCurrent = () => generationRef.current === generation;
    setPhase('more');

    try {
      const cursor = cursorRef.current;
      const result = await StreamPostsController.getOrFetchStreamSlice({
        streamId,
        lastPostId: cursor.lastPostId,
        streamTail: cursor.streamTail,
        limit: COLLECTIONS_SECTION_PAGE_SIZE,
      });
      if (!isCurrent()) return;

      // `nextPageIds` is already post-filter; `nextCursor` is the raw skip
      // offset the stream layer consumed to produce it. Dedup is defensive
      // only — the stream layer's cursor accounting should prevent overlap.
      const base = visibleIdsRef.current;
      const seen = new Set(base);
      const fresh = result.nextPageIds.filter((id) => !seen.has(id));

      cursorRef.current = {
        lastPostId: resolveResumeAnchor(result) ?? cursor.lastPostId,
        streamTail: result.nextCursor ?? cursor.streamTail,
      };
      setReachedEnd(result.reachedEnd === true);
      setVisibleIds([...base, ...fresh]);

      // A Show More click that surfaces nothing new while the stream still
      // has posts means the stream layer's bounded scan was fully filtered
      // (cap hit). Give the click feedback instead of silently doing nothing.
      if (fresh.length === 0 && result.reachedEnd !== true) {
        toast({
          variant: 'warning',
          description: 'No new collections found right now. Try again later.',
        });
      }
    } catch (error) {
      if (!isCurrent()) return;
      Logger.error('[DiscoverCollections] Failed to fetch slice', { error });
      toast({
        variant: 'error',
        description: 'Failed to load collections. Please try again.',
      });
      // Give up on this action so the spinner clears.
      setReachedEnd(true);
    } finally {
      if (isCurrent()) {
        setPhase('idle');
      }
    }
  };

  // Initial load — wait until the auth store has rehydrated so the stream
  // layer filters against the *settled* viewer from the very first fetch.
  // Cleanup (StrictMode re-run, viewer switch, unmount) bumps the generation,
  // so every load still in flight drops its result.
  useEffect(() => {
    if (!hasHydrated) return;
    void reset({ keepGrid: false });

    return () => {
      generationRef.current += 1;
    };
    // `reset` is intentionally excluded: it closes over refs and is recreated
    // on every render, so including it would re-fire this initial-load effect
    // on every state update and restart the fetch mid-stream. The auth/stream
    // identity deps below are the only triggers we want.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasHydrated, currentUserPubky, streamId]);

  // Live-reactive subtractive overlay: subscribe to the local bookmark id
  // set so any Follow performed elsewhere in the app (e.g. from the Followed
  // section's Unfollow CTA being toggled back on, or from a future surface)
  // removes the corresponding card here without a reload. While the live
  // query is still resolving (`undefined`) we render `visibleIds` unfiltered
  // — safe because the stream-layer fetch filter has already excluded
  // everything bookmarked at fetch time, so there's nothing for the overlay
  // to remove on first paint.
  const bookmarkedLive = useLiveQuery(() => BookmarkController.getAll(), []);
  const bookmarkedSet = bookmarkedLive ? new Set(bookmarkedLive) : null;

  // Unfollow reload: a collection that left the bookmark set but is not loaded
  // was dropped by the fetch-time filter, so only a reload can return it
  // (#2237). A loaded id reappears through the overlay above on its own.
  const previousBookmarkedRef = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!bookmarkedLive) return;
    const previous = previousBookmarkedRef.current;
    const current = new Set(bookmarkedLive);
    previousBookmarkedRef.current = current;
    // Before the first load starts (auth still hydrating) there is nothing to
    // reload: that load reads the current bookmarks itself.
    if (!previous || generationRef.current === 0) return;

    const isUnloadedUnfollow = (id: string) =>
      !previousBookmarkedRef.current?.has(id) && !visibleIdsRef.current.includes(id);
    const candidates = [...previous].filter((id) => !current.has(id) && isUnloadedUnfollow(id));
    if (candidates.length === 0) return;

    // Any reset that starts after this point re-reads the bookmarks, so it
    // already covers these unfollows.
    const generation = generationRef.current;
    // Bookmarks also hold ordinary posts, which never appear in Discover. An
    // id without local details (or a failed read) may still be a collection.
    void PostController.getDetailsByIds({ compositeIds: candidates })
      .then((details) =>
        candidates.filter((_, index) => {
          const kind = details[index]?.kind;
          return kind === undefined || kind === 'collection';
        }),
      )
      .catch(() => candidates)
      .then((collectionIds) => {
        // Skip when a newer reset (or unmount) superseded this check, or when
        // every candidate was re-followed or loaded while it ran.
        if (generationRef.current !== generation) return;
        if (!collectionIds.some(isUnloadedUnfollow)) return;
        void reset({ keepGrid: visibleIdsRef.current.length > 0 });
      });
    // `reset` is recreated on every render (it closes over refs); only a new
    // bookmark snapshot should trigger this check.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookmarkedLive]);

  // Live overlay for deletions + empty collections: subscribes to `post_details`
  // (via `getDetailsByIds`) for the current visible set and returns the subset
  // whose content has flipped to '[DELETED]' OR whose item count has fallen to
  // zero. Catches mid-session changes — e.g. an author deletes a collection or
  // removes its last item on another device — so the card disappears from
  // Discover without a reload. The stream-layer fetch filter covers the cold
  // path; this overlay covers the live path.
  const hideLive = useLiveQuery(async () => {
    if (visibleIds.length === 0) return new Set<string>();
    const details = await PostController.getDetailsByIds({ compositeIds: visibleIds });
    const hide = new Set<string>();
    for (let i = 0; i < visibleIds.length; i += 1) {
      const detail = details[i];
      if (!detail) continue;
      if (isPostDeleted(detail.content)) {
        hide.add(visibleIds[i]);
        continue;
      }
      if ((parseCollectionContent(detail.content)?.items?.length ?? 0) === 0) {
        hide.add(visibleIds[i]);
      }
    }
    return hide;
  }, [visibleIds]);
  const hideSet = hideLive ?? null;
  const displayIds = visibleIds.filter((id) => {
    if (bookmarkedSet && bookmarkedSet.has(id)) return false;
    if (hideSet && hideSet.has(id)) return false;
    return true;
  });

  // Unique authors of currently-visible cards (the AvatarStack caps it).
  const headerPubkys = uniqueAuthors(displayIds);

  const showShowMore = !reachedEnd && !loading;
  // Discover always starts empty (no live-query fast path) — show skeletons
  // for the entire initial-load duration.
  const showSkeletons = loading && displayIds.length === 0;
  // Truly-exhausted empty state: stream reachedEnd AND nothing left to show
  // after the live overlay subtracts followed cards. If the user has
  // followed everything we surfaced mid-session, `reachedEnd` may still be
  // false and Show More will be visible instead — that's intentional.
  const showEmpty = !loading && reachedEnd && displayIds.length === 0;

  return (
    <Container overrideDefaults data-cy="discover-collections-section" className="flex w-full flex-col gap-4">
      <Container overrideDefaults className="flex items-center gap-3">
        <Heading level={2} size="lg" className="font-light text-muted-foreground">
          {'Discover Collections'}
        </Heading>
        {showSkeletons ? <AvatarStackSkeleton count={3} size="md" /> : <AvatarStack pubkys={headerPubkys} />}
      </Container>

      {showEmpty ? (
        <Typography overrideDefaults className="text-sm text-muted-foreground">
          {'No collections to discover right now.'}
        </Typography>
      ) : (
        <Container overrideDefaults className="grid w-full grid-cols-1 gap-3 lg:grid-cols-2 lg:gap-6">
          {showSkeletons
            ? Array.from({ length: COLLECTIONS_SECTION_SKELETON_COUNT }).map((_, index) => (
                <CollectionCardSkeleton key={`discover-collections-skeleton-${index}`} />
              ))
            : displayIds.map((compositeId) => {
                const { pubky, id } = parseCompositeId(compositeId);
                return <CollectionCard key={compositeId} authorPubky={pubky} postId={id} />;
              })}
        </Container>
      )}

      {showShowMore && (
        <Container overrideDefaults className="flex w-full justify-center">
          <Button variant="default" size="sm" onClick={() => void showMore()} disabled={loadingMore}>
            {loadingMore && <Loader2 className="size-4 animate-spin" />}
            {'Show more'}
          </Button>
        </Container>
      )}
    </Container>
  );
}
