'use client';

import { useOgMetadata } from '@/hooks/useOgMetadata/useOgMetadata';
import type { TPinakesResourceDetail } from '@/services/pinakes/pinakes.types';
import { getHttpUrl, getResourceLinks } from './ResourceCard.utils';
import { getResourcePost } from './ResourcePost';

/** A post's link preview image (`usePostPreviewImage`) and whether it is still being read. */
export interface TPostPreviewImage {
  image: string | null;
  /** Its preview is being read: whether the post has a video is not known yet. */
  pending: boolean;
}

/**
 * The link preview image of a post the card tells (`getResourcePost`) when the card has no image of its
 * own: the same preview the card reads to fill that image (`/api/og-metadata` of the card's own link,
 * one read for both), so an X post whose preview is a video still counts as a video post
 * (`hasPostVideo`). `null` otherwise, and while it is read (`pending`); nothing is read unless `enabled`.
 */
export function usePostPreviewImage(card: TPinakesResourceDetail | null, enabled: boolean): TPostPreviewImage {
  const link =
    enabled && card && getResourcePost(card) !== null && !getHttpUrl(card.image)
      ? getResourceLinks(card).linkUrl
      : null;
  const { metadata, isLoading, error } = useOgMetadata(link);
  if (!link) return { image: null, pending: false };
  return {
    image: getHttpUrl(metadata?.image),
    pending: isLoading || (metadata === null && error === null),
  };
}
