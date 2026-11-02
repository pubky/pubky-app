'use client';
import { type MouseEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { Button } from '@/atoms/Button/Button';
import {
  Carousel,
  type CarouselApi,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/atoms/Carousel/Carousel';
import { Container } from '@/atoms/Container/Container';
import { Dialog, DialogContent, DialogTrigger } from '@/atoms/Dialog/Dialog';
import { Image } from '@/atoms/Image/Image';
import { Typography } from '@/atoms/Typography/Typography';
import { Video } from '@/atoms/Video/Video';
import { getAttachmentPreviewUrl } from '@/libs/file/attachmentPreviewUrl';
import { cn } from '@/libs/utils/utils';
import type { AttachmentConstructed } from '@/organisms/PostAttachments/PostAttachments.types';
import { PostAttachmentsCarouselImage } from '../PostAttachmentsCarouselImage/PostAttachmentsCarouselImage';

const MAX_VISIBLE_MEDIA = 4;

/** The default media grid; its pending skeleton shares it so the two never drift. */
export const MEDIA_GRID_CLASS = 'gap-3 sm:grid-cols-2';
// List media tiles follow the 16:9 design spec — spacing.48 (192px) wide, spacing.27 (108px) tall.
const LIST_GRID_CLASS =
  'grid w-fit max-w-full grid-cols-[minmax(0,theme(spacing.48))] self-start justify-self-start sm:grid-cols-[repeat(2,theme(spacing.48))]';
const LIST_TILE_CLASS = 'aspect-video h-[theme(spacing.27)] max-w-full';
// Shared tile framing for both image and video cells (single-media collapse + last-odd span).
const TILE_FRAME_CLASS = 'relative only:h-auto sm:last:odd:col-span-2';
const LIST_TILE_FRAME_CLASS = cn(TILE_FRAME_CLASS, 'only:w-fit');
/**
 * Collapsed media row (#2868): one tile on mobile, two from `sm` up, the rest behind "Show more".
 * Hidden with CSS rather than removed, so the breakpoint needs no JS and the lightbox keeps the full set.
 * The pending skeleton shares it so a loading lock collapses the same way.
 */
export const collapsedTileClass = (index: number) =>
  index >= 2 ? 'hidden' : index === 1 ? 'max-sm:hidden' : undefined;
// "+N more" badge shown on the last visible tile when media overflows the grid.
const REMAINING_OVERLAY_CLASS =
  'absolute right-3 bottom-3 z-10 flex size-10 items-center justify-center rounded-full border border-secondary-foreground/40 bg-black/80 text-base font-bold text-white shadow-md';

/** Movement under this is still a tap, not a pan. */
const TAP_SLOP_PX = 10;

/**
 * Whether a point lands on the picture an object-contain image draws, not the transparent bands around it. The rect
 * includes the zoom transform, so this follows the picture as it is shown.
 */
const isOnDrawnImage = (img: HTMLImageElement, x: number, y: number) => {
  const rect = img.getBoundingClientRect();
  if (!img.naturalWidth || !img.naturalHeight) return true;
  const fit = Math.min(rect.width / img.naturalWidth, rect.height / img.naturalHeight);
  const width = img.naturalWidth * fit;
  const height = img.naturalHeight * fit;
  const left = rect.left + (rect.width - width) / 2;
  const top = rect.top + (rect.height - height) / 2;
  return x >= left && x <= left + width && y >= top && y <= top + height;
};

/** Whether a press lands on the see-through space around the media rather than on the media or a control. */
const isOutsideMedia = (target: EventTarget, x: number, y: number) => {
  if (!(target instanceof Element) || target.closest('button, video')) return false;
  if (target instanceof HTMLImageElement) return !isOnDrawnImage(target, x, y);
  return true;
};

type PostAttachmentsImagesAndVideosProps = {
  imagesAndVideos: AttachmentConstructed[];
  variant?: 'default' | 'list';
  /**
   * Show one row (one tile on mobile, two from `sm` up) with a "Show more" toggle for the rest.
   * Default grid only; the lightbox always holds every item.
   */
  collapsible?: boolean;
  renderTrigger?: (props: {
    imagesAndVideos: AttachmentConstructed[];
    isPreviewOpen: boolean;
    openPreview: (index: number, event?: MouseEvent) => void;
  }) => ReactNode;
};
export const PostAttachmentsImagesAndVideos = ({
  imagesAndVideos,
  variant = 'default',
  collapsible = false,
  renderTrigger,
}: PostAttachmentsImagesAndVideosProps) => {
  const total = imagesAndVideos.length;
  const [open, setOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [api, setApi] = useState<CarouselApi>();
  const [currentIndex, setCurrentIndex] = useState(0);
  // embla reads watchDrag on every pointer down, so swiping is decided per drag. A drag that starts on a zoomed image
  // pans it instead; the zoom frame says so on its own `data-zoomed`, so the carousel keeps no copy of it. A boolean
  // option would make embla re-initialise each time zoom crosses 1x. A second finger landing is a pinch, never a swipe.
  const canSwipe = (_api: unknown, event: globalThis.MouseEvent | TouchEvent) =>
    !(event.target instanceof Element && event.target.closest('[data-zoomed="true"]')) &&
    !('touches' in event && event.touches.length > 1);
  const carouselRef = useRef<HTMLDivElement>(null);
  // Judged on press: a double tap that zooms out has refitted the picture by the time its click arrives
  const pressRef = useRef<{ x: number; y: number; outside: boolean } | null>(null);
  const [previewTrigger, setPreviewTrigger] = useState<HTMLElement | null>(null);
  const openPreview = (index: number, event?: MouseEvent) => {
    event?.stopPropagation();
    if (event?.currentTarget instanceof HTMLElement) setPreviewTrigger(event.currentTarget);
    setCurrentIndex(index);
    setOpen(true);
  };

  useEffect(() => {
    if (!api) {
      return;
    }
    const onSelect = () => {
      setCurrentIndex(api.selectedScrollSnap());
    };
    onSelect();
    api.on('select', onSelect);
    // 'reInit' fires when the slide list changes (e.g. an edit removed
    // attachments while the lightbox is open) — embla clamps its index but
    // emits no 'select', so resync here too
    api.on('reInit', onSelect);
    return () => {
      api.off('select', onSelect);
      api.off('reInit', onSelect);
    };
  }, [api]);
  const isOnlyMedia = imagesAndVideos.length === 1;
  const isListVariant = variant === 'list';
  const visibleMedia = isListVariant ? imagesAndVideos.slice(0, MAX_VISIBLE_MEDIA) : imagesAndVideos;
  const remainingMediaCount = isListVariant ? Math.max(0, imagesAndVideos.length - visibleMedia.length) : 0;
  const remainingOverlayIndex = remainingMediaCount > 0 ? visibleMedia.length - 1 : -1;
  // Two tiles fill the desktop row, so with exactly two only mobile has anything to reveal.
  const hasCollapseToggle = collapsible && !isListVariant && total > 1;
  const tileCollapseClass = (index: number) =>
    hasCollapseToggle && !isExpanded ? collapsedTileClass(index) : undefined;

  const renderRemainingOverlay = (index: number, onClick?: (event: MouseEvent) => void) => {
    if (index !== remainingOverlayIndex) {
      return null;
    }

    // Video tiles stop click propagation, so their overlay needs its own handler;
    // image tiles sit inside the DialogTrigger button and just need a static badge.
    if (onClick) {
      return (
        <Button
          overrideDefaults
          type="button"
          aria-label={`Open media carousel with ${remainingMediaCount} more items`}
          onClick={onClick}
          className={REMAINING_OVERLAY_CLASS}
        >
          +{remainingMediaCount}
        </Button>
      );
    }

    return <Typography className={REMAINING_OVERLAY_CLASS}>+{remainingMediaCount}</Typography>;
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {renderTrigger ? (
        renderTrigger({ imagesAndVideos, openPreview, isPreviewOpen: open })
      ) : (
        <>
          {/* Grid layout */}
          <Container
            display={isListVariant ? undefined : 'grid'}
            overrideDefaults={isListVariant}
            className={isListVariant ? cn('gap-3', LIST_GRID_CLASS) : MEDIA_GRID_CLASS}
          >
            {visibleMedia.map((media, i) =>
              media.type.startsWith('image') ? (
                <DialogTrigger
                  key={i}
                  asChild
                  className={cn(
                    isListVariant ? LIST_TILE_CLASS : 'h-52 w-full max-w-full',
                    isListVariant ? LIST_TILE_FRAME_CLASS : TILE_FRAME_CLASS,
                    'cursor-pointer outline-none only:static focus-visible:ring-2 focus-visible:ring-ring',
                    tileCollapseClass(i),
                  )}
                >
                  <Button overrideDefaults onClick={(e) => openPreview(i, e)}>
                    <Image
                      src={getAttachmentPreviewUrl(media)}
                      alt={media.name}
                      fill={!isOnlyMedia}
                      className={cn(
                        'rounded-md',
                        isOnlyMedia
                          ? cn(
                              isListVariant ? 'max-h-[theme(spacing.27)] w-fit' : 'max-h-96 max-w-full',
                              'object-contain',
                            )
                          : 'object-cover object-center',
                      )}
                    />
                    {renderRemainingOverlay(i)}
                  </Button>
                </DialogTrigger>
              ) : isListVariant ? (
                <Container
                  key={i}
                  overrideDefaults
                  className={cn(LIST_TILE_CLASS, LIST_TILE_FRAME_CLASS, 'only:max-h-[theme(spacing.27)]')}
                >
                  <Video
                    onClick={(e) => {
                      e.stopPropagation();
                    }}
                    src={media.urls.main}
                    pauseVideo={open}
                    className="h-full w-full cursor-auto object-cover"
                  />
                  {renderRemainingOverlay(i, (e) => openPreview(i, e))}
                </Container>
              ) : (
                <Video
                  key={i}
                  onClick={(e) => {
                    e.stopPropagation();
                  }}
                  src={media.urls.main}
                  pauseVideo={open}
                  className={cn(
                    'h-52 w-full max-w-full cursor-auto only:h-auto only:max-h-96 sm:last:odd:col-span-2',
                    tileCollapseClass(i),
                  )}
                />
              ),
            )}
          </Container>
          {hasCollapseToggle && (
            // The app's Show more button (as in the collections lists), centred under the row.
            <Container overrideDefaults className={cn('flex w-full justify-center', total === 2 && 'sm:hidden')}>
              <Button
                type="button"
                variant="default"
                size="sm"
                aria-expanded={isExpanded}
                onClick={(event) => {
                  // The post card navigates on click; the toggle must not.
                  event.stopPropagation();
                  setIsExpanded((expanded) => !expanded);
                }}
              >
                {isExpanded ? 'Show less' : 'Show more'}
              </Button>
            </Container>
          )}
        </>
      )}

      {/* Carousel dialog */}
      <DialogContent
        hiddenTitle="Post Attachments Media Carousel"
        aria-describedby={undefined}
        showCloseButton={false}
        overrideDefaults
        centered
        // Edge to edge on mobile; the vertical gutter stays as the tap-outside-to-close area.
        className="mx-0 w-full sm:mx-4 sm:w-auto"
        // Radix would focus its one stored trigger (the last tile mounted) and scroll to it; return to the tile tapped
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          previewTrigger?.focus({ preventScroll: true });
        }}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          carouselRef.current?.focus();
        }}
        onPointerDownCapture={(e) => {
          pressRef.current = { x: e.clientX, y: e.clientY, outside: isOutsideMedia(e.target, e.clientX, e.clientY) };
        }}
        onClick={(e) => {
          e.stopPropagation();
          const press = pressRef.current;
          // A keyboard-activated click (detail 0) has no point; a press that travelled was a pan
          if (e.detail === 0 || !press?.outside) return;
          if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > TAP_SLOP_PX) return;
          setOpen(false);
        }}
      >
        <Carousel
          ref={carouselRef}
          opts={{
            startIndex: currentIndex,
            loop: true,
            duration: 15,
            watchDrag: canSwipe,
          }}
          setApi={setApi}
          className="w-full max-w-full sm:max-w-[75dvw] 2xl:max-w-[50dvw]"
        >
          <CarouselContent className="-ml-3 items-center">
            {imagesAndVideos.map((media, i) => {
              // Keyed by the media too: another attachment taking this slot gets a fresh slide, with no zoom carried over
              const slideKey = `${i}-${media.urls.main}`;
              return (
                <CarouselItem key={slideKey} className="basis-full pl-3">
                  {media.type.startsWith('image') ? (
                    <PostAttachmentsCarouselImage
                      image={media}
                      // Only the visible slide can zoom; the others reset to the fitted size.
                      isActive={currentIndex === i}
                      className={total > 1 ? 'h-[calc(75dvh+1.5rem)]' : 'h-[calc(75dvh+3rem)]'}
                    />
                  ) : (
                    <Video
                      src={media.urls.main}
                      pauseVideo={currentIndex !== i}
                      className={cn('w-full', total > 1 ? 'max-h-[calc(75dvh+1.5rem)]' : 'max-h-[calc(75dvh+3rem)]')}
                    />
                  )}
                </CarouselItem>
              );
            })}
          </CarouselContent>

          {total > 1 && (
            <>
              <CarouselPrevious className="hidden hover:bg-secondary sm:inline-flex" />
              <CarouselNext className="hidden hover:bg-secondary sm:inline-flex" />
            </>
          )}
        </Carousel>

        {total > 1 && (
          <Container className="mt-2 h-4 flex-row items-center justify-center">
            <Typography size="xs" className="leading-4 text-muted-foreground">
              {currentIndex + 1}/{total}
            </Typography>
          </Container>
        )}
      </DialogContent>
    </Dialog>
  );
};
