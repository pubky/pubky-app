'use client';
import { useState } from 'react';
import { Image } from '@/atoms/Image/Image';
import { usePinchZoom } from '@/hooks/usePinchZoom/usePinchZoom';
import { getAttachmentPreviewUrl } from '@/libs/file/attachmentPreviewUrl';
import { cn } from '@/libs/utils/utils';
import type { AttachmentConstructed } from '@/organisms/PostAttachments/PostAttachments.types';

type PostAttachmentsCarouselImageProps = {
  image: AttachmentConstructed;
  /** False on a slide that is not showing: its zoom resets, so swiping back finds it fitted. */
  isActive?: boolean;
  className?: string;
};

export const PostAttachmentsCarouselImage = ({
  image,
  isActive = true,
  className,
}: PostAttachmentsCarouselImageProps) => {
  const [isMainLoaded, setIsMainLoaded] = useState(image.type === 'image/gif');
  const { frameRef, transform, isZoomed, isGesturing, handlers } = usePinchZoom({ enabled: isActive });

  return (
    // touch-none: the page never zooms (the root viewport sets userScalable: false), so pinch, double tap and pan
    // are handled here and only here.
    <div
      ref={frameRef}
      data-testid="carousel-image-zoom-frame"
      // The carousel reads this to hand a drag on a zoomed image to panning instead of swiping
      data-zoomed={isZoomed}
      className={cn(
        'relative flex h-[75dvh] w-full touch-none items-center justify-center overflow-hidden rounded-md select-none',
        isZoomed ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in',
        className,
      )}
      onDragStart={(event) => event.preventDefault()}
      {...handlers}
    >
      <div
        data-testid="carousel-image-zoom-content"
        className={cn(
          'flex h-full w-full origin-center items-center justify-center',
          !isGesturing && 'transition-transform duration-150 ease-out',
        )}
        style={{ transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})` }}
      >
        {/* Feed image shown as placeholder while main loads */}
        {!isMainLoaded && (
          <Image
            src={getAttachmentPreviewUrl(image)}
            alt={image.name}
            className="max-h-full w-full rounded-md object-contain"
          />
        )}

        {/* Main high-res image */}
        <Image
          src={image.urls.main}
          alt={image.name}
          className={isMainLoaded ? 'max-h-full w-full rounded-md object-contain' : 'size-0'}
          onLoad={() => setIsMainLoaded(true)}
        />
      </div>
    </div>
  );
};
