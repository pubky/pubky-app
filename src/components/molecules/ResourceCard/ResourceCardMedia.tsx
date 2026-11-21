'use client';

import { type SyntheticEvent, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Container } from '@/atoms/Container/Container';
import { cn } from '@/libs/utils/utils';
import { PostAttachmentsImagesAndVideos } from '@/molecules/PostAttachmentsImagesAndVideos/PostAttachmentsImagesAndVideos';

interface ResourceCardMediaProps {
  /** An `http(s)` image. */
  imageUrl: string;
  /** What the image shows: the card's title, its name here and in the lightbox. */
  name: string;
  /** A card whose object is gone: its image is dimmed. */
  dimmed?: boolean;
  /** Called with `imageUrl` when it fails to load; the card then shows its next image or its type tile. */
  onImageError: (imageUrl: string) => void;
}

/**
 * The card's image, under its text, shown as a post shows its one image (`PostAttachmentsImagesAndVideos`): whole,
 * in its own shape up to the post's height, and a tap opens the same lightbox, with pinch and double-tap zoom. A
 * press on the image never opens the resource page (`data-resource-controls`). Never wider than the image itself, so
 * a small one (a site's logo as its link's preview) is not blown up.
 */
export function ResourceCardMedia({ imageUrl, name, dimmed, onImageError }: ResourceCardMediaProps) {
  const [loaded, setLoaded] = useState<{ url: string; width: number } | null>(null);
  const naturalWidth = loaded?.url === imageUrl ? loaded.width : null;
  return (
    <Container
      overrideDefaults
      data-resource-controls
      data-testid="resource-card-image"
      // An image's `load` and `error` do not bubble in the DOM, but React's do: the post's image reports here.
      onLoad={(event) => {
        const image = getOwnImage(event);
        if (image && image.naturalWidth > 0) setLoaded({ url: imageUrl, width: image.naturalWidth });
      }}
      onError={(event) => {
        if (getOwnImage(event)) onImageError(imageUrl);
      }}
      // At most as wide as a post's media, in the middle of a wide card (a feed's Wide layout, the page).
      className={cn('mx-auto w-full max-w-2xl', dimmed && 'opacity-60')}
      style={naturalWidth ? { maxWidth: naturalWidth } : undefined}
    >
      <PostAttachmentsImagesAndVideos imagesAndVideos={[{ type: 'image/*', name, urls: { main: imageUrl } }]} />
    </Container>
  );
}

/** The card's own image, not one of the lightbox's: those are in its React tree, but outside this element. */
function getOwnImage(event: SyntheticEvent<HTMLElement>): HTMLImageElement | null {
  const { target, currentTarget } = event;
  return target instanceof HTMLImageElement && currentTarget.contains(target) ? target : null;
}

interface ResourceCardTypeTileProps {
  /** The type's icon. */
  typeIcon: LucideIcon;
  isLarge: boolean;
}

/**
 * Left of the card's text when it has no image, or its images fail to load: a square tile with the type's icon, so
 * a sparse card keeps its shape and says what it is. Aligned to the top so a tall text column never stretches it.
 */
export function ResourceCardTypeTile({ typeIcon: TypeIcon, isLarge }: ResourceCardTypeTileProps) {
  // The tile only says what the thing is: smaller on a phone, so a long title keeps its width.
  const tileSize = isLarge ? 'size-16 sm:size-40' : 'size-12 sm:size-24';
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
