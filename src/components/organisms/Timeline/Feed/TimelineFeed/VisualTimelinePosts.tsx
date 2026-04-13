'use client';

import * as React from 'react';
import { Virtuoso } from 'react-virtuoso';
import { TIMELINE_VIRTUOSO_OVERSCAN_PX } from '@/config';
import * as Atoms from '@/atoms';
import * as Core from '@/core';
import * as Hooks from '@/hooks';
import * as Libs from '@/libs';
import * as Molecules from '@/molecules';
import * as Organisms from '@/organisms';
import {
  VISUAL_AUTO_PAGINATE_MIN_ROWS,
  VISUAL_GRID_MAX_WIDTH_PX,
  VISUAL_TILE_ASPECT_RATIOS,
  VISUAL_TILE_COLUMN_SPANS,
} from './TimelineFeedVisual.helpers';
import type {
  VisualTimelinePostsProps,
  VisualTileImageProps,
  VisualTimelineRowProps,
  VisualTimelineTileOverlayProps,
  VisualTimelineTileProps,
  VisualTileVideoProps,
} from './VisualTimelinePosts.types';
import {
  TimelineVirtuosoFooter,
  type TimelineVirtuosoContext,
} from '@/components/molecules/Timeline/TimelineVirtuosoFooter';
import { useVisualFeedTiles } from './useVisualFeedTiles';

const visualVirtuosoComponents = { Footer: TimelineVirtuosoFooter };

function stopPropagation(event: React.SyntheticEvent) {
  event.stopPropagation();
}

function VisualTileVideo({ tile }: VisualTileVideoProps) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const { ref, isVisible } = Hooks.useViewportObserver({
    rootMargin: '300px 0px 300px 0px',
  });

  React.useEffect(() => {
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
    <Atoms.Container ref={ref} overrideDefaults className="absolute inset-0">
      <Atoms.Video
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
    </Atoms.Container>
  );
}

function VisualTileImage({ tile }: VisualTileImageProps) {
  const [currentSrc, setCurrentSrc] = React.useState(tile.previewSrc);
  const hasFallenBackToMainRef = React.useRef(tile.previewSrc === tile.mainSrc);

  React.useEffect(() => {
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

  return <Atoms.Image src={currentSrc} alt={tile.attachmentName} fill className="object-cover" onError={handleError} />;
}

function VisualTimelineTileOverlay({ tile, size, onReplyClick, onRepostClick }: VisualTimelineTileOverlayProps) {
  const userId = React.useMemo(() => Core.parseCompositeId(tile.postId).pubky, [tile.postId]);
  const { userDetails } = Hooks.useUserDetails(userId);
  const avatarUrl = Hooks.useAvatarUrl(userDetails);
  const { formatRelativeTime } = Hooks.useRelativeTime();
  const indexedAt = new Date(tile.indexedAt);
  const [tagsExpanded, setTagsExpanded] = React.useState(false);
  const isCompact = size === 'square';
  const truncatedContent = React.useMemo(() => {
    const trimmedContent = tile.content.trim();

    if (!trimmedContent) {
      return trimmedContent;
    }

    const limit = isCompact ? 120 : size === 'wide' ? 260 : 180;
    return Molecules.truncateAtWordBoundary(trimmedContent, limit);
  }, [isCompact, size, tile.content]);

  return (
    <Atoms.Container
      overrideDefaults
      className={Libs.cn(
        'pointer-events-none absolute inset-0 flex flex-col justify-between bg-[linear-gradient(180deg,rgba(5,5,10,0.58)_0%,rgba(5,5,10,0.72)_100%)] opacity-0 backdrop-blur-[3px] transition-opacity duration-200 group-focus-within:opacity-100 group-hover:opacity-100',
        isCompact ? 'p-4' : 'p-5',
      )}
    >
      <Atoms.Container
        overrideDefaults
        className="pointer-events-none drop-shadow-[0_2px_10px_rgba(5,5,10,0.9)] group-focus-within:pointer-events-auto group-hover:pointer-events-auto"
      >
        <Atoms.Container
          overrideDefaults
          data-testid="visual-overlay-content-stack"
          className={Libs.cn('flex flex-col gap-4', isCompact ? 'max-h-44' : 'max-h-56')}
        >
          <Atoms.Container overrideDefaults className="flex items-start justify-between gap-4">
            <Atoms.Container overrideDefaults className="min-w-0 flex-1">
              {userDetails ? (
                <Molecules.PostHeaderUserInfo userId={userId} userName={userDetails.name || ''} avatarUrl={avatarUrl} />
              ) : (
                <Atoms.Container overrideDefaults className="flex items-center gap-2">
                  <Atoms.Skeleton className="size-6 rounded-full bg-white/20" />
                  <Atoms.Skeleton className="h-3 w-20 rounded-md bg-white/20" />
                </Atoms.Container>
              )}
            </Atoms.Container>

            <Atoms.Container overrideDefaults className="shrink-0 pt-0.5 [&_span]:text-white/70 [&_svg]:text-white/70">
              <Molecules.PostHeaderTimestamp timeAgo={formatRelativeTime(indexedAt)} indexedAt={indexedAt} />
            </Atoms.Container>
          </Atoms.Container>

          {truncatedContent ? (
            <Atoms.Container
              overrideDefaults
              className={Libs.cn('overflow-hidden', isCompact ? 'max-h-[84px]' : 'max-h-[96px]')}
            >
              <Molecules.PostText
                content={truncatedContent}
                className={Libs.cn(
                  'text-white drop-shadow-[0_2px_10px_rgba(5,5,10,0.9)] [&_*]:text-white [&_blockquote]:border-white/30 [&_button]:text-white [&_button]:hover:text-white/80',
                  isCompact ? 'text-sm leading-5' : 'text-base leading-6',
                )}
              />
            </Atoms.Container>
          ) : null}
        </Atoms.Container>
      </Atoms.Container>

      <Atoms.Container
        overrideDefaults
        onClick={stopPropagation}
        onPointerDown={stopPropagation}
        className={Libs.cn(
          'pointer-events-none w-full drop-shadow-[0_2px_10px_rgba(5,5,10,0.9)] group-focus-within:pointer-events-auto group-hover:pointer-events-auto',
          isCompact ? 'mt-4 flex flex-col gap-4' : 'mt-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-4',
        )}
      >
        <Organisms.ClickableTagsList
          taggedId={tile.postId}
          taggedKind={Core.TagKind.POST}
          showCount={true}
          showInput={tagsExpanded}
          showAddButton={!tagsExpanded}
          addMode={true}
          maxTags={isCompact ? 3 : 4}
          className={Libs.cn(
            'text-white [&_[role=button]]:border-white/20',
            isCompact ? 'max-w-full' : 'min-w-0 flex-1',
          )}
        />

        <Organisms.PostActionsBar
          postId={tile.postId}
          variant="visual"
          onTagClick={() => setTagsExpanded((previousValue) => !previousValue)}
          onReplyClick={onReplyClick}
          onRepostClick={onRepostClick}
          className={Libs.cn(isCompact ? 'justify-start' : 'shrink-0 justify-end')}
        />
      </Atoms.Container>
    </Atoms.Container>
  );
}

function VisualTimelineTile({ tile, size, onNavigate }: VisualTimelineTileProps) {
  const isTouchDevice = Hooks.useIsTouchDevice();
  const [replyDialogOpen, setReplyDialogOpen] = React.useState(false);
  const [repostDialogOpen, setRepostDialogOpen] = React.useState(false);

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
      <Atoms.Container
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
          <Organisms.PostContentBlurred postId={tile.postId} className="h-full rounded-none" />
        ) : tile.mediaKind === 'video' ? (
          <VisualTileVideo tile={tile} />
        ) : (
          <VisualTileImage tile={tile} />
        )}

        {!isTouchDevice && !tile.isBlurred ? (
          <VisualTimelineTileOverlay
            tile={tile}
            size={size}
            onReplyClick={() => setReplyDialogOpen(true)}
            onRepostClick={() => setRepostDialogOpen(true)}
          />
        ) : null}
      </Atoms.Container>

      <Organisms.DialogReply postId={tile.postId} open={replyDialogOpen} onOpenChangeAction={setReplyDialogOpen} />
      <Organisms.DialogRepost postId={tile.postId} open={repostDialogOpen} onOpenChangeAction={setRepostDialogOpen} />
    </>
  );
}

function VisualTimelineRow({ cell, onNavigate }: VisualTimelineRowProps) {
  return (
    <Atoms.Container
      overrideDefaults
      className="min-w-0"
      style={{
        gridColumn: `span ${VISUAL_TILE_COLUMN_SPANS[cell.size]} / span ${VISUAL_TILE_COLUMN_SPANS[cell.size]}`,
      }}
    >
      {cell.isSpacer || !cell.tile ? (
        <Atoms.Container
          overrideDefaults
          aria-hidden="true"
          className="rounded-md border border-dashed border-white/10 bg-white/[0.03]"
          style={{ aspectRatio: VISUAL_TILE_ASPECT_RATIOS[cell.size] }}
        />
      ) : (
        <VisualTimelineTile tile={cell.tile} size={cell.size} onNavigate={onNavigate} />
      )}
    </Atoms.Container>
  );
}

export function VisualTimelinePosts({
  postIds,
  loading,
  loadingMore,
  error,
  hasMore,
  loadMore,
}: VisualTimelinePostsProps) {
  const { navigateToPost } = Hooks.usePostNavigation();
  const { rows, hasPendingTiles, hasPendingFiles } = useVisualFeedTiles({ postIds, hasMore });

  // Auto-paginate when the visual grid doesn't fill the viewport. Two triggers:
  //
  // 1. rows.length <= stableRowCountRef — a page loaded but produced no new visual
  //    rows (all text posts). Virtuoso won't fire endReached because the data length
  //    didn't change, so we must load the next page ourselves.
  //
  // 2. rows.length < VISUAL_AUTO_PAGINATE_MIN_ROWS — the grid is too short to trigger
  //    scroll-based loading. Virtuoso with useWindowScroll may not fire endReached when
  //    the content doesn't fill the window (resizing the window works around this).
  //
  // hasPendingTiles and hasPendingFiles are deliberately excluded from the bail-out
  // conditions. Blocking on them creates a deadlock: the effect can't fire while tiles
  // are probing, and by the time probes finish, stableRowCountRef has been overtaken by
  // probe-driven row growth, so the "no new rows" check no longer triggers.
  const stableRowCountRef = React.useRef(0);

  React.useEffect(() => {
    if (loading) {
      stableRowCountRef.current = 0;
      return;
    }

    if (loadingMore || error || !hasMore || postIds.length === 0) {
      return;
    }

    if (rows.length <= stableRowCountRef.current || rows.length < VISUAL_AUTO_PAGINATE_MIN_ROWS) {
      void loadMore();
    }

    stableRowCountRef.current = rows.length;
  }, [loading, loadingMore, error, hasMore, postIds.length, rows.length, loadMore]);

  const showFilteredEmptyState =
    !loading &&
    !error &&
    postIds.length > 0 &&
    rows.length === 0 &&
    !hasMore &&
    !loadingMore &&
    !hasPendingTiles &&
    !hasPendingFiles;

  const virtuosoContext: TimelineVirtuosoContext = {
    loadingMore,
    error,
    hasMore,
    itemCount: rows.length,
  };

  return (
    <Molecules.TimelineStateWrapper
      loading={loading}
      error={error}
      hasItems={postIds.length > 0 && !showFilteredEmptyState}
    >
      {!showFilteredEmptyState ? (
        <Atoms.Container data-cy="visual-feed-container">
          <Atoms.Container
            overrideDefaults
            className="mx-auto w-full"
            style={{ maxWidth: `${VISUAL_GRID_MAX_WIDTH_PX}px` }}
          >
            <Virtuoso
              useWindowScroll
              data={rows}
              context={virtuosoContext}
              overscan={TIMELINE_VIRTUOSO_OVERSCAN_PX}
              computeItemKey={(_index, row) => row.key}
              endReached={() => {
                if (!loadingMore && hasMore) {
                  void loadMore();
                }
              }}
              itemContent={(_index, row) => (
                <Atoms.Container overrideDefaults className="grid grid-cols-12 gap-6 pb-6">
                  {row.cells.map((cell) => (
                    <VisualTimelineRow key={cell.key} cell={cell} onNavigate={navigateToPost} />
                  ))}
                </Atoms.Container>
              )}
              components={visualVirtuosoComponents}
            />
          </Atoms.Container>
        </Atoms.Container>
      ) : null}
    </Molecules.TimelineStateWrapper>
  );
}
