'use client';
import { useEffect, useState } from 'react';
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

type PostAttachmentsImagesAndVideosProps = {
  imagesAndVideos: AttachmentConstructed[];
};
export const PostAttachmentsImagesAndVideos = ({ imagesAndVideos }: PostAttachmentsImagesAndVideosProps) => {
  const total = imagesAndVideos.length;
  const [open, setOpen] = useState(false);
  const [api, setApi] = useState<CarouselApi>();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const { toast } = useToast();
  const tFullscreen = useTranslations('toast.fullscreen');
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
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {/* Grid layout */}
      <Container display="grid" className="gap-3 sm:grid-cols-2">
        {imagesAndVideos.map((media, i) =>
          media.type.startsWith('image') ? (
            <DialogTrigger
              key={i}
              asChild
              className="relative h-52 w-full max-w-full cursor-pointer only:static only:h-auto sm:last:odd:col-span-2"
            >
              <Button
                overrideDefaults
                onClick={(e) => {
                  e.stopPropagation();
                  setCurrentIndex(i);
                }}
              >
                <Image
                  src={media.type === 'image/gif' ? media.urls.main : (media.urls.feed as string)}
                  alt={media.name}
                  fill={!isOnlyMedia}
                  className={cn(
                    'rounded-md',
                    isOnlyMedia ? 'max-h-96 max-w-full object-contain' : 'object-cover object-center',
                  )}
                />
              </Button>
            </DialogTrigger>
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
