'use client';

import { type SyntheticEvent, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { DialogTrigger } from '@/atoms/Dialog/Dialog';
import { Image } from '@/atoms/Image/Image';
import { cn } from '@/libs/utils/utils';
import { PostAttachmentsImagesAndVideos } from '@/molecules/PostAttachmentsImagesAndVideos/PostAttachmentsImagesAndVideos';

interface ResourceCardMediaProps {
  /** The image on the app's image route (`getResourceImageUrl`): never its host's address. */
  imageUrl: string;
  /** What the image shows: the card's title, its name here and in the lightbox. */
  name: string;
  /** A card whose object is gone: its image is dimmed. */
  dimmed?: boolean;
  /** Called with `imageUrl` when it fails to load; the card then shows its next image or its type tile. */
  onImageError: (imageUrl: string) => void;
}

/**
 * An image that stands in for an embed (`showsEmbedImage`), under the card's text where the embed stands, shown as a
 * post shows its one image (`PostAttachmentsImagesAndVideos`): whole, in its own shape up to the post's height, and a
 * tap opens the same lightbox, with pinch and double-tap zoom. A press on the image never opens the resource page
 * (`data-resource-controls`). Never wider than the image itself, so a small one is not blown up.
 */
export function ResourceCardMedia({ imageUrl, name, dimmed, onImageError }: ResourceCardMediaProps) {
  const [loaded, setLoaded] = useState<{ url: string; width: number } | null>(null);
  const naturalWidth = loaded?.url === imageUrl ? loaded.width : null;
  return (
    <Container
      overrideDefaults
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
    >
      {/* The image's own box, in the middle: a press in it is the image's, beside it the card's. */}
      <Container
        overrideDefaults
        data-resource-controls
        data-testid="resource-card-image-fit"
        className="mx-auto"
        style={naturalWidth ? { maxWidth: naturalWidth } : undefined}
      >
        <PostAttachmentsImagesAndVideos imagesAndVideos={[{ type: 'image/*', name, urls: { main: imageUrl } }]} />
      </Container>
    </Container>
  );
}

/** From this width-to-height ratio on, a loaded image shows as a 16:9 thumbnail instead of a square. */
const WIDE_RATIO = 1.4;

interface ResourceCardCoverProps extends ResourceCardMediaProps {
  /** The resource page's card: a larger thumbnail. */
  isLarge: boolean;
  /** The type's own frame is 16:9 (a video, a film: `hasWideImage`): wide before the image loads. */
  wideByType?: boolean;
}

/**
 * A card's own image, not one that stands in for an embed (`showsEmbedImage`): its own, a group member's or its
 * link's preview (an event's, an article's, a cover, a photo). Small, left of the card's text: a 16:9 thumbnail when
 * the loaded image is wide (`WIDE_RATIO`), a square when it is upright, and by its type (`wideByType`) before it
 * loads; aligned to the top so a tall text column never stretches it. A tap opens it in the post's lightbox
 * (`PostAttachmentsImagesAndVideos`, its own trigger), with pinch and double-tap zoom; a press on it never opens the
 * resource page (`data-resource-controls`), the rest of the card still does.
 */
export function ResourceCardCover({
  imageUrl,
  name,
  isLarge,
  wideByType = false,
  dimmed,
  onImageError,
}: ResourceCardCoverProps) {
  const [loadedShape, setLoadedShape] = useState<{ url: string; wide: boolean } | null>(null);
  const isWide = loadedShape?.url === imageUrl ? loadedShape.wide : wideByType;
  const squareSize = isLarge ? 'size-24 sm:size-40' : 'size-20 sm:size-24';
  const wideSize = isLarge ? 'aspect-video w-40 sm:w-64' : 'aspect-video w-28 sm:w-40';
  return (
    <Container
      overrideDefaults
      data-resource-controls
      data-testid="resource-card-image"
      data-shape={isWide ? 'wide' : 'square'}
      onLoad={(event) => {
        const image = getOwnImage(event);
        if (!image || image.naturalWidth <= 0 || image.naturalHeight <= 0) return;
        const ratio = image.naturalWidth / image.naturalHeight;
        // Wide when the image is; square when it is upright (a cover, a poster), whatever the type says.
        if (ratio >= WIDE_RATIO) setLoadedShape({ url: imageUrl, wide: true });
        else if (ratio < 1) setLoadedShape({ url: imageUrl, wide: false });
      }}
      onError={(event) => {
        if (getOwnImage(event)) onImageError(imageUrl);
      }}
      className={cn('shrink-0 self-start', dimmed && 'opacity-60')}
    >
      <PostAttachmentsImagesAndVideos
        imagesAndVideos={[{ type: 'image/*', name, urls: { main: imageUrl } }]}
        renderTrigger={({ openPreview }) => (
          // The lightbox's own trigger, as a post's image tile is: it says it opens a dialog.
          <DialogTrigger asChild>
            <Button
              overrideDefaults
              type="button"
              onClick={(event) => openPreview(0, event)}
              className="block cursor-pointer rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Image
                src={imageUrl}
                alt={name}
                width={isWide ? (isLarge ? 256 : 160) : isLarge ? 160 : 96}
                height={isWide ? (isLarge ? 144 : 90) : isLarge ? 160 : 96}
                className={cn('rounded-md object-cover object-center', isWide ? wideSize : squareSize)}
              />
            </Button>
          </DialogTrigger>
        )}
      />
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
