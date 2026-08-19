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
import { useToast } from '@/molecules/Toaster/use-toast';
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
  const { toast } = useToast();
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
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // Ref of currently-visible IDs, read inside the async fetch so appends can
  // dedup without re-creating the function on every successful append.
  const visibleIdsRef = useRef<string[]>([]);
  visibleIdsRef.current = visibleIds;

  // Cancellation token for the in-flight initial fetch. When the effect
  // re-fires (StrictMode double-invoke, or genuine viewer switch), the old
  // fetch's closure sees `cancelled.current === true` and skips its state
  // writes — only the latest run wins. This is the React-recommended
  // pattern for fetch-in-effect (see https://react.dev/reference/react/useEffect
  // "Fetching data with Effects").
  const inFlightInitialRef = useRef<{ cancelled: boolean } | null>(null);

  /**
   * One user-initiated action (initial mount or Show More click): pull one
   * post-filter slice from the stream layer and append it.
   *
   * Optionally takes a `token` that the caller can flip to `cancelled` to
   * make the run a no-op on its state writes (used by the initial-load
   * effect to handle StrictMode double-invoke and real viewer-switch
   * re-fires).
   */
  const runUserAction = async ({ isInitial, token }: { isInitial: boolean; token?: { cancelled: boolean } }) => {
    if (token?.cancelled) return;
    if (isInitial) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }

    try {
      let cursor = cursorRef.current;
      if (isInitial) {
        // First mount: clear stale cache + sync any unread posts in case
        // the engagement stream changed across sessions. Mirrors
        // `useStreamPagination.fetchStreamSlice(isInitialLoad=true)`.
        // Skip-paginated streams always start at offset 0.
        await StreamPostsController.prepareStreamForInitialLoad({ streamId });
        if (token?.cancelled) return;
        cursor = EMPTY_CURSOR;
      }

      const result = await StreamPostsController.getOrFetchStreamSlice({
        streamId,
        lastPostId: cursor.lastPostId,
        streamTail: cursor.streamTail,
        limit: COLLECTIONS_SECTION_PAGE_SIZE,
      });
      if (token?.cancelled) return;

      // `nextPageIds` is already post-filter; `nextCursor` is the raw skip
      // offset the stream layer consumed to produce it. Dedup is defensive
      // only — the stream layer's cursor accounting should prevent overlap.
      const base = isInitial ? [] : visibleIdsRef.current;
      const seen = new Set(base);
      const fresh = result.nextPageIds.filter((id) => !seen.has(id));

      // Anchor is inert for this skip stream's offset pagination, but resolves the
      // same way as every other feed so the semantics stay uniform.
      cursorRef.current = {
        lastPostId: resolveResumeAnchor(result) ?? cursor.lastPostId,
        streamTail: result.nextCursor ?? cursor.streamTail,
      };
      setReachedEnd(result.reachedEnd === true);
      setVisibleIds([...base, ...fresh]);

      // A Show More click that surfaces nothing new while the stream still
      // has posts means the stream layer's bounded scan was fully filtered
      // (cap hit). Give the click feedback instead of silently doing nothing.
      if (!isInitial && fresh.length === 0 && result.reachedEnd !== true) {
        toast({
          variant: 'warning',
          description: 'No new collections found right now. Try again later.',
        });
      }
    } catch (error) {
      Logger.error('[DiscoverCollections] Failed to fetch slice', { error });
      if (token?.cancelled) return;
      // Mirror `MyCollections`' `useStreamPagination({ onError })` toast so the
      // three Collections sections fail consistently from the user's POV.
      toast({
        variant: 'error',
        description: 'Failed to load collections. Please try again.',
      });
      // Give up on this action so the spinner clears.
      setReachedEnd(true);
    } finally {
      if (token?.cancelled) return;
      if (isInitial) {
        setLoading(false);
      } else {
        setLoadingMore(false);
      }
    }
  };

  // Initial load — wait until the auth store has rehydrated so the stream
  // layer filters against the *settled* viewer from the very first fetch.
  //
  // Uses the cancellation-token pattern: on effect cleanup (StrictMode
  // re-run or real dep change) the previous run is flagged `cancelled` and
  // skips all of its remaining `set*` calls and cursor commits. Only the
  // latest run survives — no interleaved double-fetch corruption.
  useEffect(() => {
    if (!hasHydrated) return;

    // Mark any previous in-flight run as cancelled.
    if (inFlightInitialRef.current) {
      inFlightInitialRef.current.cancelled = true;
    }
    const token = { cancelled: false };
    inFlightInitialRef.current = token;

    setVisibleIds([]);
    cursorRef.current = EMPTY_CURSOR;
    setReachedEnd(false);
    void runUserAction({ isInitial: true, token });

    return () => {
      token.cancelled = true;
    };
    // `runUserAction` is intentionally excluded: it closes over refs
    // (`inFlightInitialRef`, `cursorRef`) and is recreated on every render, so
    // including it would re-fire this initial-load effect on every state update
    // and restart the fetch mid-stream. The auth/stream identity deps below are
    // the only triggers we want.
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
          <Button
            variant="default"
            size="sm"
            onClick={() => void runUserAction({ isInitial: false })}
            disabled={loadingMore}
          >
            {loadingMore && <Loader2 className="size-4 animate-spin" />}
            {'Show more'}
          </Button>
        </Container>
      )}
    </Container>
  );
}
