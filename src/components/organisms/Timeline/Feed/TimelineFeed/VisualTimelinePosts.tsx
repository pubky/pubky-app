'use client';

import React, { useEffect } from 'react';
import { TagKind } from '@/application/tag/tag.types';
import { Card } from '@/atoms/Card/Card';
import { Container } from '@/atoms/Container/Container';
import { Image } from '@/atoms/Image/Image';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';
import { Video } from '@/atoms/Video/Video';
import { useAvatarUrl } from '@/hooks/useAvatarUrl/useAvatarUrl';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll/useInfiniteScroll';
import { useIsTouchDevice } from '@/hooks/useIsTouchDevice/useIsTouchDevice';
import { usePostNavigation } from '@/hooks/usePostNavigation/usePostNavigation';
import { usePostReplyRepostDialogs } from '@/hooks/usePostReplyRepostDialogs/usePostReplyRepostDialogs';
import { useRelativeTime } from '@/hooks/useRelativeTime/useRelativeTime';
import { useUserDetails } from '@/hooks/useUserDetails/useUserDetails';
import { useViewportObserver } from '@/hooks/useViewportObserver/useViewportObserver';
import { cn } from '@/libs/utils/utils';
import { parseCompositeId } from '@/models/models.utils';
import { PostDeleted } from '@/molecules/PostDeleted/PostDeleted';
import { PostHeaderTimestamp } from '@/molecules/PostHeaderTimestamp/PostHeaderTimestamp';
import { PostHeaderUserInfo } from '@/molecules/PostHeaderUserInfo/PostHeaderUserInfo';
import { PostMissing } from '@/molecules/PostMissing/PostMissing';
import { PostText } from '@/molecules/PostText/PostText';
import { truncateAtWordBoundary } from '@/molecules/PostText/PostText.utils';
import { TimelineEndMessage } from '@/molecules/Timeline/TimelineEndMessage';
import { TimelineError } from '@/molecules/Timeline/TimelineError';
import { TimelineStateWrapper } from '@/molecules/Timeline/TimelineStateWrapper/TimelineStateWrapper';
import { ClickableTagsList } from '../../../ClickableTagsList/ClickableTagsList';
import { PostActionsBar } from '../../../PostActionsBar/PostActionsBar';
import { PostContentBlurred } from '../../../PostContentBlurred/PostContentBlurred';
import {
  appendVisualTrailingCell,
  VISUAL_GRID_MAX_WIDTH_PX,
  VISUAL_TILE_ASPECT_RATIOS,
  VISUAL_TILE_COLUMN_SPANS,
} from './TimelineFeedVisual.helpers';
import { useVisualFeedTiles } from './useVisualFeedTiles';
import { VisualTimelinePostsSkeleton } from './VisualTimelinePosts.skeleton';
import type {
  VisualTileImageProps,
  VisualTileVideoProps,
  VisualTimelinePlaceholderTileProps,
  VisualTimelinePostsProps,
  VisualTimelineRowProps,
  VisualTimelineTileOverlayProps,
  VisualTimelineTileProps,
} from './VisualTimelinePosts.types';

function stopPropagation(event: React.SyntheticEvent) {
  event.stopPropagation();
}

function VisualTileVideo({ tile }: VisualTileVideoProps) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const { ref, isVisible } = useViewportObserver({
    rootMargin: '300px 0px 300px 0px',
  });

  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    if (!isVisible) {
      videoElement.pause();
      return;
    }

    void videoElement.play().catch(() => {
      // Autoplay can be blocked in some environments. The preview still works with user interaction.
    });
  }, [isVisible]);

  const handleTimeUpdate = React.useCallback(() => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    if (videoElement.currentTime >= 5) {
      videoElement.currentTime = 0;
      void videoElement.play().catch(() => {
        // Ignore autoplay restarts that are blocked by the browser.
      });
    }
  }, []);

  return (
    <Container ref={ref} overrideDefaults className="absolute inset-0">
      <Video
        ref={videoRef}
        src={tile.mainSrc}
        controls={false}
        muted
        autoPlay
        playsInline
        pauseVideo={!isVisible}
        preload="metadata"
        onTimeUpdate={handleTimeUpdate}
        className="h-full w-full rounded-none object-cover"
      />
    </Container>
  );
}

function VisualTileImage({ tile }: VisualTileImageProps) {
  const [currentSrc, setCurrentSrc] = React.useState(tile.previewSrc);
  const hasFallenBackToMainRef = React.useRef(tile.previewSrc === tile.mainSrc);

  useEffect(() => {
    setCurrentSrc(tile.previewSrc);
    hasFallenBackToMainRef.current = tile.previewSrc === tile.mainSrc;
  }, [tile.mainSrc, tile.previewSrc]);

  const handleError = React.useCallback(() => {
    if (hasFallenBackToMainRef.current || tile.previewSrc === tile.mainSrc) {
      return;
    }

    hasFallenBackToMainRef.current = true;
    setCurrentSrc(tile.mainSrc);
  }, [tile.mainSrc, tile.previewSrc]);

  return <Image src={currentSrc} alt={tile.attachmentName} fill className="object-cover" onError={handleError} />;
}

function VisualTimelineTileOverlay({ tile, size, onReplyClick, onRepostClick }: VisualTimelineTileOverlayProps) {
  const userId = React.useMemo(() => parseCompositeId(tile.postId).pubky, [tile.postId]);
  const { userDetails } = useUserDetails(userId);
  const avatarUrl = useAvatarUrl(userDetails);
  const { formatRelativeTime } = useRelativeTime();
  const indexedAt = new Date(tile.indexedAt);
  const [tagsExpanded, setTagsExpanded] = React.useState(false);
  const isCompact = size === 'square';
  const truncatedContent = React.useMemo(() => {
    const trimmedContent = tile.content.trim();

    if (!trimmedContent) {
      return trimmedContent;
    }

    const limit = isCompact ? 120 : size === 'wide' ? 260 : 180;
    return truncateAtWordBoundary(trimmedContent, limit);
  }, [isCompact, size, tile.content]);

  return (
    <Container
      overrideDefaults
      className={cn(
        'pointer-events-none absolute inset-0 flex flex-col justify-between bg-[linear-gradient(180deg,rgba(5,5,10,0.58)_0%,rgba(5,5,10,0.72)_100%)] opacity-0 backdrop-blur-[3px] transition-opacity duration-200 group-focus-within:opacity-100 group-hover:opacity-100',
        isCompact ? 'p-4' : 'p-5',
      )}
    >
      <Container
        overrideDefaults
        className="pointer-events-none group-focus-within:pointer-events-auto group-hover:pointer-events-auto"
      >
        <Container
          overrideDefaults
          data-testid="visual-overlay-content-stack"
          className={cn('flex flex-col gap-4', isCompact ? 'max-h-44' : 'max-h-56')}
        >
          <Container overrideDefaults className="flex items-start justify-between gap-4">
            <Container overrideDefaults className="min-w-0 flex-1">
              {userDetails ? (
                <PostHeaderUserInfo userId={userId} userName={userDetails.name || ''} avatarUrl={avatarUrl} />
              ) : (
                <Container overrideDefaults className="flex items-center gap-2">
                  <Skeleton className="size-6 rounded-full bg-white/20" />
                  <Skeleton className="h-3 w-20 rounded-md bg-white/20" />
                </Container>
              )}
            </Container>

            <Container overrideDefaults className="shrink-0 pt-0.5 [&_span]:text-white/70 [&_svg]:text-white/70">
              <PostHeaderTimestamp timeAgo={formatRelativeTime(indexedAt)} indexedAt={indexedAt} />
            </Container>
          </Container>

          {truncatedContent ? (
            <Container overrideDefaults className={cn('overflow-hidden', isCompact ? 'max-h-[84px]' : 'max-h-[96px]')}>
              <PostText
                content={truncatedContent}
                className={cn(
                  'text-white [&_*]:text-white [&_blockquote]:border-white/30 [&_button]:text-white [&_button]:hover:text-white/80',
                  isCompact ? 'text-sm leading-5' : 'text-base leading-6',
                )}
              />
            </Container>
          ) : null}
        </Container>
      </Container>

      <Container
        overrideDefaults
        onClick={stopPropagation}
        onPointerDown={stopPropagation}
        className={cn(
          'pointer-events-none w-full group-focus-within:pointer-events-auto group-hover:pointer-events-auto',
          isCompact ? 'mt-4 flex flex-col gap-4' : 'mt-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-4',
        )}
      >
        <ClickableTagsList
          taggedId={tile.postId}
          taggedKind={TagKind.POST}
          showCount={true}
          showInput={tagsExpanded}
          showAddButton={!tagsExpanded}
          addMode={true}
          maxTags={isCompact ? 3 : 4}
          className={cn('text-white', isCompact ? 'max-w-full' : 'min-w-0 flex-1')}
        />

        <PostActionsBar
          postId={tile.postId}
          variant="visual"
          onTagClick={() => setTagsExpanded((previousValue) => !previousValue)}
          onReplyClick={onReplyClick}
          onRepostClick={onRepostClick}
          className={cn(isCompact ? 'justify-start' : 'shrink-0 justify-end')}
        />
      </Container>
    </Container>
  );
}

function VisualTimelineTile({ tile, size, onNavigate }: VisualTimelineTileProps) {
  const isTouchDevice = useIsTouchDevice();
  const { openReplyDialog, openRepostDialog, dialogs } = usePostReplyRepostDialogs(tile.postId);

  const handleNavigate = React.useCallback(() => {
    onNavigate(tile.postId);
  }, [onNavigate, tile.postId]);

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.target !== event.currentTarget) return;

      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        handleNavigate();
      }
    },
    [handleNavigate],
  );

  return (
    <>
      <Container
        overrideDefaults
        role="button"
        tabIndex={0}
        data-cy="visual-feed-tile"
        aria-label={`Open post ${tile.postId}`}
        onClick={handleNavigate}
        onKeyDown={handleKeyDown}
        className="group relative size-full cursor-pointer overflow-hidden rounded-md border border-white/10 bg-black focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:outline-none"
        style={{ aspectRatio: VISUAL_TILE_ASPECT_RATIOS[size] }}
      >
        {tile.isBlurred ? (
          <PostContentBlurred postId={tile.postId} className="h-full rounded-none" />
        ) : tile.mediaKind === 'video' ? (
          <VisualTileVideo tile={tile} />
        ) : (
          <VisualTileImage tile={tile} />
        )}

        {!isTouchDevice && !tile.isBlurred ? (
          <VisualTimelineTileOverlay
            tile={tile}
            size={size}
            onReplyClick={openReplyDialog}
            onRepostClick={openRepostDialog}
          />
        ) : null}
      </Container>

      {dialogs}
    </>
  );
}

/**
 * Deleted / not-found collection items keep their mosaic slot as a card-surface
 * placeholder — the same PostDeleted/PostMissing copy Grid and List show — so
 * item counts stay consistent across layouts. Clickable like the Grid/List
 * cards (navigates to the post page); no hover overlay or post actions.
 */
function VisualTimelinePlaceholderTile({ tile, size, onNavigate }: VisualTimelinePlaceholderTileProps) {
  const handleNavigate = () => {
    onNavigate(tile.postId);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleNavigate();
    }
  };

  return (
    <Card
      role="button"
      tabIndex={0}
      data-cy="visual-feed-placeholder-tile"
      onClick={handleNavigate}
      onKeyDown={handleKeyDown}
      className="flex size-full cursor-pointer items-center justify-center rounded-md py-0 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      style={{ aspectRatio: VISUAL_TILE_ASPECT_RATIOS[size] }}
    >
      {tile.placeholderKind === 'deleted' ? <PostDeleted /> : <PostMissing />}
    </Card>
  );
}

function VisualTimelineRow({ cell, onNavigate, trailingSlot }: VisualTimelineRowProps) {
  return (
    <Container
      overrideDefaults
      className="min-w-0"
      style={{
        gridColumn: `span ${VISUAL_TILE_COLUMN_SPANS[cell.size]} / span ${VISUAL_TILE_COLUMN_SPANS[cell.size]}`,
      }}
    >
      {cell.isTrailingSlot ? (
        <Container overrideDefaults style={{ aspectRatio: VISUAL_TILE_ASPECT_RATIOS[cell.size] }}>
          {trailingSlot}
        </Container>
      ) : cell.isSpacer || !cell.tile ? (
        <Container
          overrideDefaults
          aria-hidden="true"
          className="rounded-md border border-dashed border-white/10 bg-white/[0.03]"
          style={{ aspectRatio: VISUAL_TILE_ASPECT_RATIOS[cell.size] }}
        />
      ) : cell.tile.placeholderKind ? (
        <VisualTimelinePlaceholderTile tile={cell.tile} size={cell.size} onNavigate={onNavigate} />
      ) : (
        <VisualTimelineTile tile={cell.tile} size={cell.size} onNavigate={onNavigate} />
      )}
    </Container>
  );
}

export function VisualTimelinePosts({
  postIds,
  loading,
  loadingMore,
  error,
  hasMore,
  loadMore,
  emptyState,
  trailingSlot,
  hiddenItemsNotice,
  showEndMessage = true,
  showUnavailablePosts = false,
}: VisualTimelinePostsProps) {
  const { navigateToPost } = usePostNavigation();
  const { rows, hiddenPostCount, hasPendingSnapshot, hasPendingTiles, hasPendingFiles, hasPendingPostDetails } =
    useVisualFeedTiles({
      postIds,
      hasMore,
      showUnavailablePosts,
    });
  const initialBackfillInFlightRef = React.useRef(false);
  const hasRows = rows.length > 0;
  const shouldBackfillInitialRows =
    !loading && !loadingMore && !error && !hasPendingSnapshot && postIds.length > 0 && !hasRows && hasMore;
  const isResolvingInitialRows =
    !error &&
    postIds.length > 0 &&
    !hasRows &&
    (hasPendingSnapshot || hasMore || loadingMore || hasPendingTiles || hasPendingFiles || hasPendingPostDetails);
  const isInitialLoading = loading || isResolvingInitialRows;

  useEffect(() => {
    if (!shouldBackfillInitialRows) return;
    if (initialBackfillInFlightRef.current) return;

    initialBackfillInFlightRef.current = true;
    void Promise.resolve()
      .then(() => loadMore())
      .finally(() => {
        initialBackfillInFlightRef.current = false;
      });
  }, [loadMore, shouldBackfillInitialRows]);

  const { sentinelRef } = useInfiniteScroll({
    onLoadMore: loadMore,
    hasMore: hasMore && hasRows,
    isLoading: loadingMore || isInitialLoading,
    threshold: 3000,
    debounceMs: 20,
  });

  const showFilteredEmptyState =
    !loading &&
    !error &&
    postIds.length > 0 &&
    !hasRows &&
    !hasMore &&
    !loadingMore &&
    !hasPendingSnapshot &&
    !hasPendingTiles &&
    !hasPendingFiles &&
    !hasPendingPostDetails;

  // The CTA lives outside the raw tile rows so it never satisfies or suppresses
  // the backfill/empty logic above — it is appended for display only.
  const displayRows = trailingSlot != null ? appendVisualTrailingCell(rows) : rows;
  const showHiddenNotice = hiddenItemsNotice != null && hiddenPostCount > 0;
  const hasExtras = trailingSlot != null || showHiddenNotice;
  const showEmptyStateWithTrailingSlot = postIds.length === 0 && trailingSlot != null && emptyState != null;

  return (
    <TimelineStateWrapper
      loading={isInitialLoading}
      error={error}
      hasItems={(hasRows && !showFilteredEmptyState) || hasExtras}
      loadingComponent={<VisualTimelinePostsSkeleton />}
      emptyComponent={emptyState}
    >
      {!showFilteredEmptyState || hasExtras ? (
        <Container data-cy="visual-feed-container">
          <Container
            overrideDefaults
            className="mx-auto flex w-full flex-col gap-6"
            style={{ maxWidth: `${VISUAL_GRID_MAX_WIDTH_PX}px` }}
          >
            {showEmptyStateWithTrailingSlot ? emptyState : null}

            {showHiddenNotice ? hiddenItemsNotice : null}

            {displayRows.map((row) => (
              <Container key={row.key} overrideDefaults className="grid grid-cols-12 gap-6">
                {row.cells.map((cell) => (
                  <VisualTimelineRow
                    key={cell.key}
                    cell={cell}
                    onNavigate={navigateToPost}
                    trailingSlot={trailingSlot}
                  />
                ))}
              </Container>
            ))}

            {error && postIds.length > 0 && <TimelineError message={error} />}

            {showEndMessage && !hasMore && !loadingMore && rows.length > 0 && <TimelineEndMessage />}

            {/* Infinite-scroll sentinel — only mounted (and given height) while there are
                more posts to observe for, mirroring TimelineGridPosts. Once the feed is
                fully loaded the observer detaches, so rendering it would just leave dead
                space below the mosaic. */}
            {hasMore && <Container overrideDefaults className="h-5" ref={sentinelRef} />}
          </Container>
        </Container>
      ) : null}
    </TimelineStateWrapper>
  );
}
