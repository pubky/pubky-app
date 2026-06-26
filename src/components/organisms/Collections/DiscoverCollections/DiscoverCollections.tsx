'use client';

import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Heading } from '@/atoms/Heading/Heading';
import { Typography } from '@/atoms/Typography/Typography';
import {
  COLLECTIONS_DISCOVER_BACKFILL_MAX_ROUNDS,
  COLLECTIONS_SECTION_PAGE_SIZE,
  COLLECTIONS_SECTION_SKELETON_COUNT,
} from '@/config/collections';
import { BookmarkController } from '@/controllers/bookmark/bookmark';
import { PostController } from '@/controllers/post/post';
import { StreamPostsController } from '@/controllers/stream/posts/posts';
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
  // `streamTail` is a *skip offset* — the running count of raw post IDs already
  // pulled from the stream — NOT a timestamp / engagement score. See
  // `createPostStreamParams` (engagement sorting branch) and the equivalent
  // engagement handling in `useStreamPagination` (`cursorValue =
  // postIdsRef.current.length`). Using `result.timestamp` here (which is
  // `last_post_score` for engagement streams) breaks Show More: Nexus skips
  // by the engagement score, yielding overlap or empty pages, and the backfill
  // loop can't make progress.
  streamTail: number;
}

const EMPTY_CURSOR: DiscoverCursor = { lastPostId: undefined, streamTail: 0 };

/**
 * DiscoverCollections
 *
 * "Discover Collections" section. Pulls the global engagement-sorted
 * collection-kind post stream (`total_engagement:all:collection`) and
 * filters out:
 *   - The current user's own collections.
 *   - Collections the current user has already bookmarked (followed).
 *   - Collections whose local PostDetails is tombstoned (`'[DELETED]'`).
 *   - Collections with zero items (nothing to discover).
 *
 * Filtering happens in two layers:
 *
 *   1. **Fetch-time filter** — read `BookmarkController.getAll()`
 *      synchronously after `getOrFetchStreamSlice` resolves and drop own
 *      + already-bookmarked ids before they ever enter `visibleIds`.
 *      This is the structural filter that prevents an unfiltered-flash on
 *      initial render (a `useLiveQuery`-driven id list would have that
 *      problem; ours doesn't).
 *
 *   2. **Render-time subtractive overlay** — `useLiveQuery` subscribes
 *      to the local `bookmarks` table and yields a set of currently
 *      bookmarked composite ids. `displayIds` is `visibleIds` minus that
 *      set. The overlay is monotonically subtractive (it can only remove,
 *      never add unfiltered cards), so it cannot reintroduce the
 *      unfiltered-flash class of bug fixed in QA #1/#3. Its job is to
 *      keep Discover semantically honest: when the user follows a card
 *      — here, from another section, or from a future surface — the
 *      card disappears from Discover without a reload.
 *
 * If the user follows every visible card mid-session, the grid empties
 * but Show More remains until `reachedEnd` (the global engagement stream
 * is exhausted). This is intentional: it reads as "you've followed
 * everything we showed you — click for more candidates."
 *
 * Backfill loop bounded by `COLLECTIONS_DISCOVER_BACKFILL_MAX_ROUNDS` —
 * each user-initiated action (initial mount or "Show more" click) will
 * pull up to that many slices if the fetch-time filter empties the page.
 */
export function DiscoverCollections() {
  const t = useTranslations('collections');
  const { toast } = useToast();
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

  // Ref of currently-visible IDs, read inside the async fetch loop so we
  // don't have to re-create the function on every successful append.
  const visibleIdsRef = useRef<string[]>([]);
  visibleIdsRef.current = visibleIds;

  // Cancellation token for the in-flight initial fetch. When the effect
  // re-fires (StrictMode double-invoke, or genuine viewer switch), the old
  // fetch's closure sees `cancelled.current === true` and skips its state
  // writes — only the latest run wins. This is the React-recommended
  // pattern for fetch-in-effect (see https://react.dev/reference/react/useEffect
  // "Fetching data with Effects"). It replaces an earlier ref-guard
  // workaround that prevented the second fetch from running at all but
  // fought StrictMode instead of cooperating with it.
  const inFlightInitialRef = useRef<{ cancelled: boolean } | null>(null);

  /**
   * One user-initiated action: pulls slices until we have at least one
   * page-size of visible (post-filter) IDs, the stream is exhausted, or
   * the backfill cap hits.
   *
   * Optionally takes a `token` that the caller can flip to `cancelled` to
   * make the run a no-op on its final state-write (used by the initial-load
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

    // Use a *local* cursor inside this run — don't trample `cursorRef`
    // until we're sure we won the race. The ref is only committed at the
    // end if the run wasn't cancelled. This keeps concurrent runs from
    // corrupting each other's pagination state under StrictMode.
    let localCursor: DiscoverCursor = isInitial ? EMPTY_CURSOR : cursorRef.current;

    try {
      const collected: string[] = [];
      let exhausted = false;

      for (let round = 0; round < COLLECTIONS_DISCOVER_BACKFILL_MAX_ROUNDS; round += 1) {
        if (isInitial && round === 0) {
          // First mount: clear stale cache + sync any unread posts in case
          // the engagement stream changed across sessions. Mirrors
          // `useStreamPagination.fetchStreamSlice(isInitialLoad=true)`.
          await StreamPostsController.prepareStreamForInitialLoad({ streamId });
          if (token?.cancelled) return;
          // Engagement streams aren't persisted to `posts_streams` (see
          // `PostStreamApplication.fetchStreamFromNexus`), so the cached
          // timestamp is always 0 here — but we keep the call for parity
          // with `useStreamPagination.fetchStreamSlice(isInitialLoad=true)`
          // in case the stream class ever changes. The skip cursor starts at 0.
          await StreamPostsController.getCachedLastPostTimestamp({ streamId });
          if (token?.cancelled) return;
          localCursor = { lastPostId: undefined, streamTail: 0 };
        }

        const result = await StreamPostsController.getOrFetchStreamSlice({
          streamId,
          lastPostId: localCursor.lastPostId,
          streamTail: localCursor.streamTail,
          limit: COLLECTIONS_SECTION_PAGE_SIZE,
        });
        if (token?.cancelled) return;

        // Walk the raw slice and collect up to `COLLECTIONS_SECTION_PAGE_SIZE`
        // post-filter IDs. We track how many raw IDs we actually walked
        // through (`rawConsumed`) so the skip cursor advances only by what we
        // consumed — candidates past the cap on the last round get re-fetched
        // on the next Show More instead of being silently dropped.
        //
        // Discover is an engagement-sorted stream: `streamTail` is a skip
        // offset (count of raw post IDs already pulled from the stream), not
        // a timestamp. Do NOT use `result.timestamp` (= `last_post_score`,
        // an engagement score) for this cursor.
        let rawConsumed = 0;
        let reachedPageCap = false;
        if (result.nextPageIds.length > 0) {
          // Read the local bookmark set after persist has committed.
          // Filter own + already-bookmarked + deleted + empty collections.
          const bookmarkedIds = new Set(await BookmarkController.getAll());
          if (token?.cancelled) return;
          // Slice post details to identify already-deleted and empty
          // collections in this batch. Mirrors the timeline's `isPostDeleted`
          // guard in `useVisualFeedTiles` and FollowedCollections' live-query
          // filter; the empty-items check drops collections with nothing to
          // discover.
          const sliceDetails = await PostController.getDetailsByIds({ compositeIds: result.nextPageIds });
          if (token?.cancelled) return;
          const deletedIds = new Set<string>();
          const emptyIds = new Set<string>();
          for (let i = 0; i < result.nextPageIds.length; i += 1) {
            const detail = sliceDetails[i];
            if (!detail) continue;
            if (isPostDeleted(detail.content)) {
              deletedIds.add(result.nextPageIds[i]);
              continue;
            }
            if ((parseCollectionContent(detail.content)?.items?.length ?? 0) === 0) {
              emptyIds.add(result.nextPageIds[i]);
            }
          }
          const alreadyVisible = new Set([...visibleIdsRef.current, ...collected]);

          for (const id of result.nextPageIds) {
            rawConsumed += 1;
            if (alreadyVisible.has(id)) continue;
            if (bookmarkedIds.has(id)) continue;
            if (deletedIds.has(id)) continue;
            if (emptyIds.has(id)) continue;
            if (isOwnCollection(id, currentUserPubky)) continue;
            collected.push(id);
            alreadyVisible.add(id);
            if (collected.length >= COLLECTIONS_SECTION_PAGE_SIZE) {
              reachedPageCap = true;
              break;
            }
          }
        }

        // Advance the cursor by raw posts actually walked. When the filter
        // empties the slice (rawConsumed === result.nextPageIds.length, none
        // collected), this still progresses so the next backfill round
        // doesn't re-fetch the same slice.
        const nextLastId = rawConsumed > 0 ? result.nextPageIds[rawConsumed - 1] : localCursor.lastPostId;
        localCursor = {
          lastPostId: nextLastId,
          streamTail: localCursor.streamTail + rawConsumed,
        };

        if (result.reachedEnd) {
          exhausted = true;
          break;
        }
        if (reachedPageCap) {
          break;
        }
      }

      if (token?.cancelled) return;

      // Commit cursor + state only after winning the race.
      cursorRef.current = localCursor;
      setReachedEnd(exhausted);
      setVisibleIds((prev) => (isInitial ? collected : [...prev, ...collected]));
    } catch (error) {
      Logger.error('[DiscoverCollections] Failed to fetch slice', { error });
      if (token?.cancelled) return;
      // Mirror `MyCollections`' `useStreamPagination({ onError })` toast so the
      // three Collections sections fail consistently from the user's POV.
      toast({
        variant: 'error',
        description: t('loadFailed'),
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

  // Initial load — wait until the auth store has rehydrated so we filter
  // against the *settled* `currentUserPubky` from the very first fetch.
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
  // — safe because the fetch-time filter has already excluded everything
  // currently bookmarked, so there's nothing for the overlay to remove on
  // first paint.
  const bookmarkedLive = useLiveQuery(() => BookmarkController.getAll(), []);
  const bookmarkedSet = bookmarkedLive ? new Set(bookmarkedLive) : null;
  // Live overlay for deletions + empty collections: subscribes to `post_details`
  // (via `getDetailsByIds`) for the current visible set and returns the subset
  // whose content has flipped to '[DELETED]' OR whose item count has fallen to
  // zero. Catches mid-session changes — e.g. an author deletes a collection or
  // removes its last item on another device — so the card disappears from
  // Discover without a reload. The fetch-time filter covers the cold path; this
  // overlay covers the live path.
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
  // for the entire initial-load duration, including any backfill rounds.
  const showSkeletons = loading && displayIds.length === 0;
  // Truly-exhausted empty state: stream reachedEnd AND nothing left to show
  // after the live overlay subtracts followed cards. If the user has
  // followed everything we surfaced mid-session, `reachedEnd` may still be
  // false and Show More will be visible instead — that's intentional.
  const showEmpty = !loading && reachedEnd && displayIds.length === 0;

  return (
    <Container overrideDefaults className="flex w-full flex-col gap-4">
      <Container overrideDefaults className="flex items-center gap-3">
        <Heading level={2} size="lg" className="font-light text-muted-foreground">
          {t('discover.title')}
        </Heading>
        {showSkeletons ? <AvatarStackSkeleton count={3} size="md" /> : <AvatarStack pubkys={headerPubkys} />}
      </Container>

      {showEmpty ? (
        <Typography overrideDefaults className="text-sm text-muted-foreground">
          {t('discover.empty')}
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
            {t('showMore')}
          </Button>
        </Container>
      )}
    </Container>
  );
}

function isOwnCollection(compositeId: string, currentUserPubky: string | null): boolean {
  if (!currentUserPubky) return false;
  try {
    const { pubky } = parseCompositeId(compositeId);
    return pubky === currentUserPubky;
  } catch {
    return false;
  }
}
