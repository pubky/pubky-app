'use client';
import { type MouseEvent, type ReactNode, useEffect, useState } from 'react';
import { Maximize, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
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
import { Dialog, DialogClose, DialogContent, DialogTrigger } from '@/atoms/Dialog/Dialog';
import { Image } from '@/atoms/Image/Image';
import { Typography } from '@/atoms/Typography/Typography';
import { Video } from '@/atoms/Video/Video';
import { cn } from '@/libs/utils/utils';
import type { AttachmentConstructed } from '@/organisms/PostAttachments/PostAttachments.types';
import { PostAttachmentsCarouselImage } from '../PostAttachmentsCarouselImage/PostAttachmentsCarouselImage';
import { useToast } from '../Toaster/use-toast';

const MAX_VISIBLE_MEDIA = 4;

// List media tiles follow the 16:9 design spec — spacing.48 (192px) wide, spacing.27 (108px) tall.
const LIST_GRID_CLASS =
  'grid w-fit max-w-full grid-cols-[minmax(0,theme(spacing.48))] self-start justify-self-start sm:grid-cols-[repeat(2,theme(spacing.48))]';
const LIST_TILE_CLASS = 'aspect-video h-[theme(spacing.27)] max-w-full';
// Shared tile framing for both image and video cells (single-media collapse + last-odd span).
const TILE_FRAME_CLASS = 'relative only:h-auto sm:last:odd:col-span-2';
const LIST_TILE_FRAME_CLASS = cn(TILE_FRAME_CLASS, 'only:w-fit');
// "+N more" badge shown on the last visible tile when media overflows the grid.
const REMAINING_OVERLAY_CLASS =
  'absolute right-3 bottom-3 z-10 flex size-10 items-center justify-center rounded-full border border-secondary-foreground/40 bg-black/80 text-base font-bold text-white shadow-md';

type PostAttachmentsImagesAndVideosProps = {
  imagesAndVideos: AttachmentConstructed[];
  variant?: 'default' | 'list';
  renderTrigger?: (props: {
    imagesAndVideos: AttachmentConstructed[];
    openPreview: (index: number, event?: MouseEvent) => void;
  }) => ReactNode;
};
export const PostAttachmentsImagesAndVideos = ({
  imagesAndVideos,
  variant = 'default',
  renderTrigger,
}: PostAttachmentsImagesAndVideosProps) => {
  const total = imagesAndVideos.length;
  const [open, setOpen] = useState(false);
  const [api, setApi] = useState<CarouselApi>();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const { toast } = useToast();
  const tFullscreen = useTranslations('toast.fullscreen');

  const openPreview = (index: number, event?: MouseEvent) => {
    event?.stopPropagation();
    setCurrentIndex(index);
    setOpen(true);
  };

  const handleFullscreen = () => {
    const currentMedia = document.getElementById(`media-item-${currentIndex}`);
    if (currentMedia) {
      currentMedia.requestFullscreen().catch((error: unknown) => {
        toast({
          variant: 'error',
          description: error instanceof Error ? error.message : tFullscreen('error'),
        });
      });
    }
  };
  useEffect(() => {
    if (!api) {
      return;
    }
    api.on('settle', () => {
      setCurrentIndex(api.selectedScrollSnap());
    });
  }, [api]);

  // Disable carousel swipe when in fullscreen mode
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement !== null);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);
  const isOnlyMedia = imagesAndVideos.length === 1;
  const isListVariant = variant === 'list';
  const visibleMedia = isListVariant ? imagesAndVideos.slice(0, MAX_VISIBLE_MEDIA) : imagesAndVideos;
  const remainingMediaCount = isListVariant ? Math.max(0, imagesAndVideos.length - visibleMedia.length) : 0;
  const remainingOverlayIndex = remainingMediaCount > 0 ? visibleMedia.length - 1 : -1;

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
        renderTrigger({ imagesAndVideos, openPreview })
      ) : (
        /* Grid layout */
        <Container
          display={isListVariant ? undefined : 'grid'}
          overrideDefaults={isListVariant}
          className={cn('gap-3', isListVariant ? LIST_GRID_CLASS : 'sm:grid-cols-2')}
        >
          {visibleMedia.map((media, i) =>
            media.type.startsWith('image') ? (
              <DialogTrigger
                key={i}
                asChild
                className={cn(
                  isListVariant ? LIST_TILE_CLASS : 'h-52 w-full max-w-full',
                  isListVariant ? LIST_TILE_FRAME_CLASS : TILE_FRAME_CLASS,
                  'cursor-pointer only:static',
                )}
              >
                <Button overrideDefaults onClick={(e) => openPreview(i, e)}>
                  <Image
                    src={media.type === 'image/gif' ? media.urls.main : (media.urls.feed ?? media.urls.main)}
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
                className="h-52 w-full max-w-full cursor-auto only:h-auto only:max-h-96 sm:last:odd:col-span-2"
              />
            ),
          )}
        </Container>
      )}

      {/* Carousel dialog */}
      <DialogContent
        hiddenTitle="Post Attachments Media Carousel"
        aria-describedby={undefined}
        showCloseButton={false}
        overrideDefaults
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <DialogClose className="absolute top-4 right-4 z-60 flex size-8 cursor-pointer items-center justify-center rounded-full bg-[rgba(5,5,10,0.30)] text-secondary-foreground/70 transition-colors hover:bg-[rgba(5,5,10,0.40)] hover:text-secondary-foreground">
          <X className="size-4" />
        </DialogClose>

        <Carousel
          opts={{
            startIndex: currentIndex,
            loop: true,
            duration: 15,
            watchDrag: !isFullscreen,
          }}
          setApi={setApi}
          className="w-full max-w-80 xsm:max-w-dvw sm:max-w-[75dvw] 2xl:max-w-[50dvw]"
        >
          <CarouselContent className="-ml-3 items-center">
            {imagesAndVideos.map((media, i) => (
              <CarouselItem key={i} className="basis-full pl-3">
                {media.type.startsWith('image') ? (
                  <PostAttachmentsCarouselImage id={`media-item-${i}`} image={media} />
                ) : (
                  <Video
                    id={`media-item-${i}`}
                    src={media.urls.main}
                    pauseVideo={currentIndex !== i}
                    className="max-h-[75dvh] w-full"
                  />
                )}
              </CarouselItem>
            ))}
          </CarouselContent>

          {total > 1 && (
            <>
              <CarouselPrevious className="hidden hover:bg-secondary sm:inline-flex" />
              <CarouselNext className="hidden hover:bg-secondary sm:inline-flex" />
            </>
          )}
        </Carousel>

        <Container className="mt-8 flex-row items-center justify-center gap-x-5.5">
          <Button
            onClick={handleFullscreen}
            disabled={!document.fullscreenEnabled}
            variant="secondary"
            size="sm"
            className="text-xs hover:bg-secondary"
          >
            Fullscreen <Maximize className="size-3" />
          </Button>

          {total > 1 && (
            <Typography size="xs" className="text-muted-foreground">
              {currentIndex + 1}/{total}
            </Typography>
          )}
        </Container>
      </DialogContent>
    </Dialog>
  );
};
