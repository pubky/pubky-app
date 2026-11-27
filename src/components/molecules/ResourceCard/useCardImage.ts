import { useState } from 'react';
import { useOgMetadata } from '@/hooks/useOgMetadata/useOgMetadata';
import {
  getCardPreviewImageUrl,
  getImageRetryUrl,
  getResourceImageUrl,
  getYouTubeThumbnailUrl,
  getYouTubeThumbnailVideoId,
} from '@/libs/image/resourceImage';
import { PinakesStatus } from '@/services/pinakes/pinakes.types';
import type { ResourceCardProps } from './ResourceCard.types';
import { getHttpUrl, getResourceLinks, getResourceStatus } from './ResourceCard.utils';
import { isBlockedCard } from './ResourceFacts.utils';
import { useResourceFallback } from './useResourceFallback';

/** The YouTube thumbnail sizes a card tries, in order: both 16:9 (`hq720` sharp, `mqdefault` there for every video). */
const YOUTUBE_CARD_SIZES = ['hq720', 'mqdefault'] as const;

interface CardImageOptions {
  /** The card may read what it lacks (its group, its link's preview): it has been on screen, or is the page's. */
  canFillIn: boolean;
  /** A description it lacks is read from its group too (the card shows one; a player's drawing does not). */
  fillDescription?: boolean;
  /** A route address the caller made for the card's own image (a post the app read), standing for it. */
  ownImageUrl?: string | null;
}

/**
 * The image a card shows, always on the app's image route (`/api/image`), never its host's address: its
 * own, else a group member's it borrows (`useResourceFallback`), else its own link's preview image
 * (`og`); a YouTube thumbnail as its 16:9 `hq720`, else `mqdefault`. Each route answer that fails is asked
 * once more, then the next image; with none left, `shownImageSrc` is `null` (the type's tile). Shared by
 * the card (`ResourceCard`) and its player's drawing (`ResourcePlayerFacade`), so both show the same.
 */
export function useCardImage(
  card: ResourceCardProps['card'],
  { canFillIn, fillDescription = true, ownImageUrl }: CardImageOptions,
) {
  const [failedImages, setFailedImages] = useState<string[]>([]);
  // Images whose route answer failed once: asked once more before the card moves on.
  const [retriedImages, setRetriedImages] = useState<string[]>([]);
  // One `<video id>/<size>` per YouTube thumbnail load that failed: each size is asked twice, then the next.
  const [youTubeMisses, setYouTubeMisses] = useState<string[]>([]);
  const isMissing = getResourceStatus(card.status) === PinakesStatus.MISSING;
  // A refused read's description (Pinakes' "Blocked by the site.") is none, as the card shows it.
  const description = isBlockedCard(card) ? null : card.description?.trim() || null;
  const imageUrl = getHttpUrl(card.image);
  // An own image that failed to load leaves the slot to a group member's, like no image at all.
  const ownImageShown = imageUrl !== null && !failedImages.includes(imageUrl);
  const fallback = useResourceFallback(card, {
    description: fillDescription && canFillIn && !description,
    image: canFillIn && !ownImageShown,
    skipImages: failedImages,
  });
  const cardImage = ownImageShown ? imageUrl : (fallback.image?.value ?? null);
  const usableCardImage = cardImage && !failedImages.includes(cardImage) ? cardImage : null;
  // A title or image the card still lacks comes from its own web link's preview (`/api/og-metadata`,
  // the link the image route reads it from too), asked once the group has answered so a group image
  // is never first replaced by the OG one. A gone (`missing`) card's link is not read. Nor is the link
  // of a site that refused Pinakes' read: the app's read meets the same wall, and its preview is the
  // site's sign-in page (its logo), not the object.
  const previewUrl = isMissing || isBlockedCard(card) ? null : getResourceLinks(card).linkUrl;
  const needsOg =
    canFillIn && previewUrl !== null && !fallback.pending && (!card.name?.trim() || usableCardImage === null);
  const { metadata: og } = useOgMetadata(needsOg ? previewUrl : null);
  const ogImage = getHttpUrl(og?.image);
  const shownImage = usableCardImage ?? (ogImage && !failedImages.includes(ogImage) ? ogImage : null);
  const onImageError = (url: string) => setFailedImages((urls) => [...urls, url]);
  // Every image comes from the app's image route, named by the card, so the viewer's browser never asks
  // its host: Pinakes' (the card's own, a group member's it borrows), or its own link's preview image
  // (`og`). The route serves an image only when that card, or its link's preview, carries it.
  const routeImage =
    shownImage === null
      ? null
      : shownImage === usableCardImage
        ? getResourceImageUrl(card.uri, shownImage)
        : getCardPreviewImageUrl(card.uri, shownImage);
  const routeImageSrc =
    routeImage && shownImage && retriedImages.includes(shownImage) ? getImageRetryUrl(routeImage) : routeImage;
  // A route answer that failed is asked once more (it may have been busy); failed again, the image is
  // remembered as the card names it, so the card moves on to its next one, never to the image's host.
  const onRouteImageError = () => {
    if (!shownImage) return;
    if (!retriedImages.includes(shownImage)) setRetriedImages((urls) => [...urls, shownImage]);
    else onImageError(shownImage);
  };
  // A YouTube thumbnail as cards name it (`hqdefault`) has bars above and below the video's frame: the card shows
  // the video's 16:9 thumbnail from the route instead, `hq720`, else `mqdefault` (every video has it), each asked
  // once more after a failure (the route may have been busy), and the image as the card names it only when neither
  // loads.
  const youTubeId = getYouTubeThumbnailVideoId(shownImage);
  const missesOf = (size: string) => youTubeMisses.filter((miss) => miss === `${youTubeId}/${size}`).length;
  const youTubeSize = youTubeId ? (YOUTUBE_CARD_SIZES.find((size) => missesOf(size) < 2) ?? null) : null;
  const youTubeUrl = youTubeId && youTubeSize ? getYouTubeThumbnailUrl(youTubeId, youTubeSize) : null;
  const youTubeSrc = youTubeUrl && youTubeSize && missesOf(youTubeSize) > 0 ? getImageRetryUrl(youTubeUrl) : youTubeUrl;
  // A route address the caller made for the card's own image stands for it (a post the app read); once
  // it fails the card shows its type's tile, as no other route serves that image.
  const givenImage = ownImageUrl && !failedImages.includes(ownImageUrl) ? ownImageUrl : null;
  const shownImageSrc = ownImageUrl ? givenImage : (youTubeSrc ?? routeImageSrc);
  const onShownImageError = () => {
    if (givenImage) onImageError(givenImage);
    else if (youTubeSrc) setYouTubeMisses((misses) => [...misses, `${youTubeId}/${youTubeSize}`]);
    else onRouteImageError();
  };
  return { fallback, og, ownImageShown, usableCardImage, youTubeSrc, shownImageSrc, onShownImageError };
}
