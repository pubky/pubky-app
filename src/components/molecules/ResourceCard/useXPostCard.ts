'use client';

import { useXPost } from '@/hooks/useXPost/useXPost';
import { getXPostImageUrl } from '@/libs/image/resourceImage';
import { getXPostId, withXPost } from '@/pipes/x-post/x-post';
import { PinakesStatus, type TPinakesResourceDetail } from '@/services/pinakes/pinakes.types';
import { getResourceStatus } from './ResourceCard.utils';
import { getResourcePost } from './ResourcePost';

/** A post's card as it shows (`useXPostCard`). */
export interface TXPostCard {
  /** Pinakes' card, or the post the app's server read as a card (`withXPost`), or `null`. */
  card: TPinakesResourceDetail | null;
  /** The post's own image from the image route (`?xpost=`), when the card is the server's read. */
  imageUrl: string | null;
  /** The post is being read: whether a card comes is not known yet. */
  pending: boolean;
}

/**
 * An X post's card that tells the post (author, text, date) also when Pinakes' does not (no card, or
 * one without its text: unread, pending, failed), with its video's MP4 for the app's player: the post read
 * by the app's own server (`useXPost`, `/api/x-post`), as a social post card (`withXPost`), its image from
 * the image route. A card that already tells the post (its video's MP4 is read on Play: `XPostPlayer`), a post gone upstream
 * (`missing`), any other link, or `enabled` false reads nothing and stays as it is; so does a post the
 * server could not read (the caller keeps its way out).
 *
 * @param card - Pinakes' card as shown (`getNativeEmbedCard`), or `null`
 * @param link - The link as written
 * @param enabled - Platform embeds up front off, and the link's card read answered (a resolve of the
 *   link may still be running: the post shows without waiting for it)
 */
export function useXPostCard(card: TPinakesResourceDetail | null, link: string, enabled: boolean): TXPostCard {
  const id = getXPostId(link) ?? getXPostId(card?.uri);
  const isGone = card !== null && getResourceStatus(card.status) === PinakesStatus.MISSING;
  // A card that tells the post reads nothing: a video in it is read for its MP4 only on its Play (`XPostPlayer`).
  const needs = enabled && id !== null && !isGone && (card === null || getResourcePost(card) === null);
  const { post, pending } = useXPost(needs ? id : null);
  if (!needs || !id || !post) return { card, imageUrl: null, pending: needs && pending };
  return { card: withXPost(card, link, post), imageUrl: getXPostImageUrl(id, post.image), pending: false };
}
