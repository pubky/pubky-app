'use client';
import { useEffect, useEffectEvent, useState } from 'react';
import { Image } from '@/atoms/Image/Image';
import { usePinchZoom } from '@/hooks/usePinchZoom/usePinchZoom';
import { getAttachmentPreviewUrl } from '@/libs/file/attachmentPreviewUrl';
import { cn } from '@/libs/utils/utils';
import type { AttachmentConstructed } from '@/organisms/PostAttachments/PostAttachments.types';

type PostAttachmentsCarouselImageProps = {
  image: AttachmentConstructed;
  id: string;
  /** False on a slide that is not showing: its zoom resets, so swiping back finds it fitted. */
  isActive?: boolean;
  /** Reports zooming in and out, so the carousel can hand a one-finger drag to panning instead of swiping. */
  onZoomChange?: (isZoomed: boolean) => void;
};

export const PostAttachmentsCarouselImage = ({
  image,
  id,
  isActive = true,
  onZoomChange,
}: PostAttachmentsCarouselImageProps) => {
  const [isMainLoaded, setIsMainLoaded] = useState(image.type === 'image/gif');
  const { frameRef, transform, isZoomed, isGesturing, handlers } = usePinchZoom({ enabled: isActive });

  const reportZoom = useEffectEvent((zoomed: boolean) => onZoomChange?.(zoomed));
  useEffect(() => {
    reportZoom(isZoomed);
  }, [isZoomed]);
  // Closing the lightbox unmounts the slide mid-zoom; the carousel must not reopen with swiping still off.
  useEffect(() => () => reportZoom(false), []);

  return (
    // touch-none: the page never zooms (the root viewport sets userScalable: false), so pinch, double tap and pan
    // are handled here and only here.
    <div
      ref={frameRef}
      data-testid="carousel-image-zoom-frame"
      data-zoomed={isZoomed}
      className={cn(
        'relative w-full touch-none overflow-hidden rounded-md select-none',
        isZoomed ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in',
      )}
      onDragStart={(event) => event.preventDefault()}
      {...handlers}
    >
      <div
        data-testid="carousel-image-zoom-content"
        className={cn('origin-center', !isGesturing && 'transition-transform duration-150 ease-out')}
        style={{ transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})` }}
      >
        {/* Feed image shown as placeholder while main loads */}
        {!isMainLoaded && (
          <Image
            src={getAttachmentPreviewUrl(image)}
            alt={image.name}
            className="max-h-[75dvh] w-full rounded-md object-contain"
          />
        )}

        {/* Main high-res image */}
        <Image
          id={isMainLoaded ? id : undefined}
          src={image.urls.main}
          alt={image.name}
          className={isMainLoaded ? 'max-h-[75dvh] w-full rounded-md object-contain' : 'size-0'}
          onLoad={() => setIsMainLoaded(true)}
        />
      </div>
    </div>
  );
};
