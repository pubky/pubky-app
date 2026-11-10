import { getResourceStatus } from '@/molecules/ResourceCard/ResourceCard.utils';
import { PinakesStatus, type TPinakesResourceDetail } from '@/services/pinakes/pinakes.types';

/**
 * What a post's embedded link shows when the platform has its own embed (an X post, a YouTube or
 * Vimeo video):
 * - `embed`: the platform's own embed in the resource frame, up front: the link's own source,
 *   also when Pinakes knows it on other services (Also on, in the ⋯ menu), or no card.
 * - `card`: our card, with the platform's embed only behind Show on (a post) or the player switch
 *   (a video), for a viewer who turned platform embeds up front off (`upFront: false`).
 *
 * An embed that failed (a deleted post) gives way to the card; one the viewer has pressed in
 * (`engaged`) stays, so a card read later never unloads a playing video.
 */
export function chooseNativeEmbed({
  hasCard,
  embedFailed = false,
  engaged = false,
  upFront = true,
}: {
  hasCard: boolean;
  embedFailed?: boolean;
  engaged?: boolean;
  upFront?: boolean;
}): 'card' | 'embed' {
  if (!hasCard) return 'embed';
  if (embedFailed) return 'card';
  return !upFront && !engaged ? 'card' : 'embed';
}

/**
 * The card to show next to a platform embed: one Pinakes has read and named. A `pending` or `error`
 * card, or one without a name, says less than the platform's own embed. A post's card repeats its
 * text as name and description: the description is left out when it only repeats the name.
 */
export function getNativeEmbedCard(card: TPinakesResourceDetail | null | undefined): TPinakesResourceDetail | null {
  const name = card?.name?.trim();
  if (!card || !name) return null;
  const status = getResourceStatus(card.status);
  if (status === PinakesStatus.PENDING || status === PinakesStatus.ERROR) return null;
  return card.description?.trim() === name ? { ...card, description: null } : card;
}

/** The accessible name of the pill that shows a platform's post (or plays its video) in our card's body, or closes it. */
export function getShowPostLabel(siteName: string | null, isOpen: boolean, isVideo = false): string {
  const site = siteName ?? 'X';
  if (isVideo) return isOpen ? `Close the ${site} video` : `Play on ${site}`;
  return isOpen ? `Close the ${site} post` : `Show on ${site}`;
}
