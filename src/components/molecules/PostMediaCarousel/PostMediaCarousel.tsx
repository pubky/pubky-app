'use client';

import { type MouseEvent, useEffect, useState } from 'react';
import { ImageOff, Maximize } from 'lucide-react';
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
import { Image } from '@/atoms/Image/Image';
import { Typography } from '@/atoms/Typography/Typography';
import { Video } from '@/atoms/Video/Video';
import { usePauseMediaOutsideViewport } from '@/hooks/usePauseMediaOutsideViewport/usePauseMediaOutsideViewport';
import { getAttachmentPreviewUrl } from '@/libs/file/attachmentPreviewUrl';
import type { AttachmentConstructed } from '@/organisms/PostAttachments/PostAttachments.types';

interface PostMediaCarouselProps {
  media: AttachmentConstructed[];
  onOpenPreview: (index: number, event?: MouseEvent) => void;
  isPreviewOpen: boolean;
}

/** Inline attachment browsing with a frame sized by the first item, shared with the existing lightbox. */
export function PostMediaCarousel({ media, onOpenPreview, isPreviewOpen }: PostMediaCarouselProps) {
  const mediaContainerRef = usePauseMediaOutsideViewport();
  const [api, setApi] = useState<CarouselApi>();
  const [selected, setSelected] = useState(0);
  const [measuredRatio, setMeasuredRatio] = useState<number>();
  const [failed, setFailed] = useState<Set<number>>(new Set());
  const first = media[0];
  const suppliedRatio = first?.width && first?.height ? first.width / first.height : undefined;
  const knownRatio = suppliedRatio && Number.isFinite(suppliedRatio) && suppliedRatio > 0 ? suppliedRatio : undefined;
  const ratio = knownRatio ?? measuredRatio ?? 4 / 3;

  useEffect(() => {
    if (!api) return;
    const select = () => setSelected(api.selectedScrollSnap());
    select();
    api.on('select', select);
    api.on('reInit', select);
    return () => {
      api.off('select', select);
      api.off('reInit', select);
    };
  }, [api]);

  const measureFirst = (index: number, width: number, height: number) => {
    if (index === 0 && width > 0 && height > 0) setMeasuredRatio(width / height);
  };
  const fail = (index: number) => setFailed((current) => new Set(current).add(index));

  return (
    <Carousel
      setApi={setApi}
      opts={{ loop: media.length > 1 }}
      aria-label="Post media"
      className="-mx-4 min-w-0 outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={(event) => event.stopPropagation()}
      onAuxClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <Container overrideDefaults ref={mediaContainerRef}>
        <CarouselContent className="ml-0">
          {media.map((item, index) => (
            <CarouselItem
              key={`${item.urls.main}-${index}`}
              className="pl-0"
              aria-label={`${index + 1} of ${media.length}`}
              aria-hidden={index !== selected}
              inert={index !== selected}
            >
              <Container
                overrideDefaults
                className="relative max-h-160 w-full overflow-hidden bg-background"
                style={{ aspectRatio: ratio }}
              >
                {failed.has(index) ? (
                  <Container
                    className="absolute inset-0 items-center justify-center gap-2 text-muted-foreground"
                    role="status"
                  >
                    <ImageOff aria-hidden="true" className="size-6" />
                    <Typography size="sm">Media unavailable</Typography>
                    <Button variant="ghost" size="sm" onClick={(event) => onOpenPreview(index, event)}>
                      Open original
                    </Button>
                  </Container>
                ) : item.type.startsWith('image') ? (
                  <Button
                    overrideDefaults
                    className="absolute inset-0 h-full w-full cursor-zoom-in outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={`Open image ${index + 1} of ${media.length}: ${item.name}`}
                    onClick={(event) => onOpenPreview(index, event)}
                  >
                    <Image
                      src={getAttachmentPreviewUrl(item)}
                      alt={item.name}
                      fill
                      className="object-contain"
                      onLoad={(event) =>
                        measureFirst(index, event.currentTarget.naturalWidth, event.currentTarget.naturalHeight)
                      }
                      onError={() => fail(index)}
                    />
                  </Button>
                ) : (
                  <>
                    <Video
                      src={item.urls.main}
                      aria-label={item.name}
                      className="absolute inset-0 h-full w-full rounded-none object-contain"
                      pauseVideo={isPreviewOpen || index !== selected}
                      onLoadedMetadata={(event) =>
                        measureFirst(index, event.currentTarget.videoWidth, event.currentTarget.videoHeight)
                      }
                      onError={() => fail(index)}
                    />
                    <Button
                      variant="secondary"
                      size="icon"
                      className="absolute top-3 right-3 z-10 size-8"
                      aria-label={`Open video ${index + 1} of ${media.length}`}
                      onClick={(event) => onOpenPreview(index, event)}
                    >
                      <Maximize className="size-4" />
                    </Button>
                  </>
                )}
              </Container>
            </CarouselItem>
          ))}
        </CarouselContent>
      </Container>
      {media.length > 1 && (
        <Container overrideDefaults className="flex items-center justify-between gap-2 px-4 pt-3">
          <CarouselPrevious className="static size-8 translate-y-0" />
          <Typography
            as="span"
            size="xs"
            className="text-muted-foreground tabular-nums"
            aria-live="polite"
            aria-atomic="true"
          >
            {`${selected + 1} / ${media.length}`}
          </Typography>
          <CarouselNext className="static size-8 translate-y-0" />
        </Container>
      )}
    </Carousel>
  );
}
