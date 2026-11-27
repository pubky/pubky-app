import type {
  TPinakesCard,
  TPinakesEpisodePage,
  TPinakesGroupDetail,
  TPinakesResourceDetail,
} from '@/services/pinakes/pinakes.types';
import { PinakesStatus } from '@/services/pinakes/pinakes.types';
import { normalizeImageSrc } from './image.validators';

/** Each address once, in `normalizeImageSrc`'s spelling; values the route never reads are left out. */
function toImageSet(values: readonly (string | null | undefined)[]): string[] {
  return [...new Set(values.map(normalizeImageSrc).filter((src): src is string => src !== null))];
}

/**
 * A card Pinakes has settled: any but one it is still reading (`pending`). A `missing` card still shows
 * its last image (dimmed), so its images are served too; a pending one's are not yet.
 */
export function isSettledCard(card: Pick<TPinakesCard, 'status'>): boolean {
  return card.status !== PinakesStatus.PENDING;
}

/**
 * The images a settled card shows of its own, the only ones the image route reads for it: its
 * `image`, and a show's latest episodes' art (`episodes`). `also_on` entries carry no image. A card
 * Pinakes is still reading (`pending`) has none to serve.
 */
export function getCardImageUrls(card: Pick<TPinakesResourceDetail, 'status' | 'image' | 'episodes'>): string[] {
  if (!isSettledCard(card)) return [];
  return toImageSet([card.image, ...(card.episodes ?? []).map((episode) => episode.image)]);
}

/**
 * The images a card may borrow from its group (`useResourceFallback`): every settled member's own
 * `image`. Read only for a card in a group of more than one (`getBorrowingGroupId`).
 */
export function getGroupImageUrls(group: Pick<TPinakesGroupDetail, 'members'>): string[] {
  return toImageSet(group.members.filter(isSettledCard).map((member) => member.image));
}

/** The art of the episodes on a page of a show's episodes (`GET /v1/resources/{id}/episodes`). */
export function getEpisodePageImageUrls(page: Pick<TPinakesEpisodePage, 'items'>): string[] {
  return toImageSet(page.items.map((episode) => episode.image));
}

/**
 * The web link a card's own preview (`og:image`) is read from when it has no image of its own: its
 * `uri`, else the address Pinakes gives for it (`open_in`), else the first web link people wrote for
 * it (`refs`), as the card links them (`getResourceLinks` without the post's link); `null` without one.
 */
export function getCardPreviewLink(card: Pick<TPinakesCard, 'uri' | 'open_in' | 'refs'>): string | null {
  const isWeb = (value: string | null | undefined): value is string => {
    if (!value) return false;
    try {
      const url = new URL(value.trim());
      return (url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password;
    } catch {
      return false;
    }
  };
  return [card.uri, card.open_in[0]?.url, ...card.refs].find(isWeb)?.trim() ?? null;
}

/** The group a settled card may borrow an image from: its `group.id` when the group has another member. */
export function getBorrowingGroupId(card: Pick<TPinakesCard, 'status' | 'group'>): string | null {
  return isSettledCard(card) && card.group && card.group.size > 1 ? card.group.id : null;
}
