'use client';

import { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Container } from '@/atoms/Container/Container';
import { Image } from '@/atoms/Image/Image';
import { cn } from '@/libs/utils/utils';

/** From this width-to-height ratio on, a loaded image shows as a 16:9 thumbnail instead of a square. */
const WIDE_RATIO = 1.4;

interface ResourceCardMediaProps {
  /** An `http(s)` image, or `null` for the type tile. */
  imageUrl: string | null;
  /** Shown in the image's place when there is none or it fails to load. */
  typeIcon: LucideIcon;
  /** The type's own frame is 16:9 (a video, a film): wide before the image loads. */
  wideByType: boolean;
  isLarge: boolean;
  /** A card whose object is gone: its image is dimmed. */
  dimmed?: boolean;
  /** Called with `imageUrl` when it fails to load; the tile takes its place. */
  onImageError: (imageUrl: string) => void;
}

/**
 * The card's image slot: a 16:9 thumbnail when the loaded image is wide (`WIDE_RATIO`), a square
 * when it is upright, and by its type before it loads; aligned to the top so a tall text column
 * never stretches it. Without an image, or when it fails to load, a square tile with the type's
 * icon, so a sparse card keeps its shape and says what it is.
 */
export function ResourceCardMedia({
  imageUrl,
  typeIcon: TypeIcon,
  wideByType,
  isLarge,
  dimmed,
  onImageError,
}: ResourceCardMediaProps) {
  const [loadedShape, setLoadedShape] = useState<{ url: string; wide: boolean } | null>(null);
  const squareSize = isLarge ? 'size-24 sm:size-40' : 'size-20 sm:size-24';
  // The tile only says what the thing is: smaller on a phone, so a long title keeps its width.
  const tileSize = isLarge ? 'size-16 sm:size-40' : 'size-12 sm:size-24';

  if (!imageUrl) {
    return (
      <Container
        overrideDefaults
        aria-hidden="true"
        data-testid="resource-card-type-tile"
        className={cn('flex shrink-0 items-center justify-center self-start rounded-md bg-foreground/5', tileSize)}
      >
        <TypeIcon className={cn('text-muted-foreground', isLarge ? 'size-7 sm:size-12' : 'size-5 sm:size-8')} />
      </Container>
    );
  }

  const isWide = loadedShape?.url === imageUrl ? loadedShape.wide : wideByType;
  return (
    <Image
      src={imageUrl}
      alt=""
      width={isWide ? (isLarge ? 256 : 160) : isLarge ? 160 : 96}
      height={isWide ? (isLarge ? 144 : 90) : isLarge ? 160 : 96}
      data-testid="resource-card-image"
      data-shape={isWide ? 'wide' : 'square'}
      onLoad={(event) => {
        const { naturalWidth, naturalHeight } = event.currentTarget;
        if (naturalWidth <= 0 || naturalHeight <= 0) return;
        const ratio = naturalWidth / naturalHeight;
        // Wide when the image is; square when it is upright (a poster), whatever the type says.
        if (ratio >= WIDE_RATIO) setLoadedShape({ url: imageUrl, wide: true });
        else if (ratio < 1) setLoadedShape({ url: imageUrl, wide: false });
      }}
      onError={() => onImageError(imageUrl)}
      className={cn(
        'shrink-0 self-start rounded-md object-cover object-center',
        isWide && (isLarge ? 'aspect-video w-40 sm:w-64' : 'aspect-video w-28 sm:w-40'),
        !isWide && squareSize,
        dimmed && 'opacity-60',
      )}
    />
  );
}
