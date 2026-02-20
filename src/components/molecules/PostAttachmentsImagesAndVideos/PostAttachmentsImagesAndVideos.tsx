'use client';

import * as Atoms from '@/atoms';
import * as Molecules from '@/molecules';
import * as Icons from '@/libs/icons';
import * as Utils from '@/libs/utils';
import type { AttachmentConstructed } from '@/organisms/PostAttachments/PostAttachments.types';
import type { CarouselApi } from '@/components/atoms/Carousel';
import { useEffect, useState } from 'react';

/** Returns proxy URL for Nexus video (fixes Content-Type for iOS Safari). Remove when Nexus serves video/mp4. */
function getVideoSrc(url: string): string {
  try {
    const parsed = new URL(url);
    if (/^nexus\.[a-z0-9-]+\.[a-z0-9.-]+$/i.test(parsed.hostname) && parsed.protocol === 'https:') {
      return `/api/video-proxy?url=${encodeURIComponent(url)}`;
    }
  } catch {
    /* invalid URL, use as-is */
  }
  return url;
}

type PostAttachmentsImagesAndVideosProps = {
  imagesAndVideos: AttachmentConstructed[];
};

export const PostAttachmentsImagesAndVideos = ({ imagesAndVideos }: PostAttachmentsImagesAndVideosProps) => {
  const total = imagesAndVideos.length;
  const [open, setOpen] = useState(false);
  const [api, setApi] = useState<CarouselApi>();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const { toast } = Molecules.useToast();

  const handleFullscreen = () => {
    const currentMedia = document.getElementById(`media-item-${currentIndex}`);

    if (currentMedia) {
      currentMedia.requestFullscreen().catch((error) => {
        toast({ title: 'Error attempting to enable fullscreen', description: error });
      });
    }
  };

  const handleVideoError = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = e.currentTarget;
    const error = video.error;
    const src = video.src;

    const MEDIA_ERR_CODES: Record<number, string> = {
      1: 'MEDIA_ERR_ABORTED (user aborted)',
      2: 'MEDIA_ERR_NETWORK (network error)',
      3: 'MEDIA_ERR_DECODE (decoding error)',
      4: 'MEDIA_ERR_SRC_NOT_SUPPORTED (format/codec not supported)',
    };

    const codeLabel = error ? MEDIA_ERR_CODES[error.code] ?? `Unknown (${error.code})` : 'No error object';
    const message = error?.message ?? 'No message';

    // H.264 codec strings for canPlayType probe (profile+level)
    const CODEC_PROBES: Array<{ label: string; mime: string }> = [
      { label: 'Baseline 3.0', mime: 'video/mp4; codecs="avc1.42E01E"' },
      { label: 'Baseline 3.1', mime: 'video/mp4; codecs="avc1.42E01F"' },
      { label: 'Main 3.1', mime: 'video/mp4; codecs="avc1.4D401F"' },
      { label: 'High 3.1', mime: 'video/mp4; codecs="avc1.64001F"' },
      { label: 'High 4.0', mime: 'video/mp4; codecs="avc1.640028"' },
      { label: 'High 4.1', mime: 'video/mp4; codecs="avc1.640029"' },
    ];

    const canPlayResults = CODEC_PROBES.map(
      (p) => `${p.label}: ${video.canPlayType(p.mime) || '(empty)'}`,
    ).join(', ');

    const diagnostics = {
      code: codeLabel,
      message,
      src,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'N/A',
      networkState: video.networkState,
      readyState: video.readyState,
      videoWidth: video.videoWidth,
      videoHeight: video.videoHeight,
      canPlayType: canPlayResults,
    };

    toast({
      title: 'Video failed to load',
      description: JSON.stringify(diagnostics, null, 2),
    });
    console.error('[Video playback failed]', diagnostics);
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
    <Atoms.Dialog open={open} onOpenChange={setOpen}>
      {/* Grid layout */}
      <Atoms.Container display="grid" className="gap-3 sm:grid-cols-2">
        {imagesAndVideos.map((media, i) =>
          media.type.startsWith('image') ? (
            <Atoms.DialogTrigger
              key={i}
              asChild
              className="relative h-52 w-full cursor-pointer only:static only:h-auto only:w-fit sm:last:odd:col-span-2"
            >
              <Atoms.Button
                overrideDefaults
                onClick={(e) => {
                  e.stopPropagation();
                  setCurrentIndex(i);
                }}
              >
                <Atoms.Image
                  src={media.type === 'image/gif' ? media.urls.main : (media.urls.feed as string)}
                  alt={media.name}
                  fill={!isOnlyMedia}
                  className={Utils.cn(
                    'rounded-md',
                    isOnlyMedia ? 'max-h-96 w-fit object-contain' : 'object-cover object-center',
                  )}
                />
              </Atoms.Button>
            </Atoms.DialogTrigger>
          ) : (
            <Atoms.Video
              key={i}
              onClick={(e) => {
                e.stopPropagation();
              }}
              src={getVideoSrc(media.urls.main)}
              pauseVideo={open}
              onError={handleVideoError}
              className="h-52 w-full cursor-auto only:h-auto only:min-w-32 only:max-h-96 only:w-fit only:object-contain sm:last:odd:col-span-2"
            />
          ),
        )}
      </Atoms.Container>

      {/* Carousel dialog */}
      <Atoms.DialogContent
        hiddenTitle="Post Attachments Media Carousel"
        aria-describedby={undefined}
        showCloseButton={false}
        overrideDefaults
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <Atoms.DialogClose className="absolute top-4 right-4 z-60 flex size-8 cursor-pointer items-center justify-center rounded-full bg-[rgba(5,5,10,0.30)] text-secondary-foreground/70 transition-colors hover:bg-[rgba(5,5,10,0.40)] hover:text-secondary-foreground">
          <Icons.X className="size-4" />
        </Atoms.DialogClose>

        <Atoms.Carousel
          opts={{
            startIndex: currentIndex,
            loop: true,
            duration: 15,
            watchDrag: !isFullscreen,
          }}
          setApi={setApi}
          className="w-full max-w-80 xsm:max-w-dvw sm:max-w-[75dvw] 2xl:max-w-[50dvw]"
        >
          <Atoms.CarouselContent className="-ml-3 items-center">
            {imagesAndVideos.map((media, i) => (
              <Atoms.CarouselItem key={i} className="basis-full pl-3">
                {media.type.startsWith('image') ? (
                  <Molecules.PostAttachmentsCarouselImage id={`media-item-${i}`} image={media} />
                ) : (
                  <Atoms.Video
                    id={`media-item-${i}`}
                    src={getVideoSrc(media.urls.main)}
                    pauseVideo={currentIndex !== i}
                    onError={handleVideoError}
                    className="max-h-[75dvh] w-full"
                  />
                )}
              </Atoms.CarouselItem>
            ))}
          </Atoms.CarouselContent>

          {total > 1 && (
            <>
              <Atoms.CarouselPrevious className="hidden hover:bg-secondary sm:inline-flex" />
              <Atoms.CarouselNext className="hidden hover:bg-secondary sm:inline-flex" />
            </>
          )}
        </Atoms.Carousel>

        <Atoms.Container className="mt-8 flex-row items-center justify-center gap-x-5.5">
          <Atoms.Button
            onClick={handleFullscreen}
            disabled={!document.fullscreenEnabled}
            variant="secondary"
            size="sm"
            className="text-xs hover:bg-secondary"
          >
            Fullscreen <Icons.Maximize className="size-3" />
          </Atoms.Button>

          {total > 1 && (
            <Atoms.Typography size="xs" className="text-muted-foreground">
              {currentIndex + 1}/{total}
            </Atoms.Typography>
          )}
        </Atoms.Container>
      </Atoms.DialogContent>
    </Atoms.Dialog>
  );
};
