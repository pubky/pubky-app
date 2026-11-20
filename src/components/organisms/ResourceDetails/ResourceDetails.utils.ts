import type { TPinakesResourceDetail } from '@/services/pinakes/pinakes.types';

/**
 * The link the card's tags, bookmark and collections are on: one people wrote (`refs`), as a post's
 * card acts on, since Nexus has no tags on a canonical `uri` nobody wrote. The page's link when it is
 * a ref, else `uri` when it is, else the most referenced; `uri` only for a card with no refs.
 */
export function getActionUri(card: TPinakesResourceDetail, pageUri: string): string {
  if (card.refs.includes(pageUri)) return pageUri;
  if (card.refs.includes(card.uri)) return card.uri;
  return card.refs[0] ?? card.uri;
}

/**
 * The link the page's thread is on (its replies, the composer's `parent`, Participants): the
 * acted-on link once the card is read, the page's own link without a card or Pinakes; `null` while
 * the card is read or without a link, so the thread is not read twice for two links.
 */
export function getThreadUri(
  pageUri: string | null,
  read: { data: TPinakesResourceDetail | null | undefined; isLoading: boolean },
  isPinakesConfigured: boolean,
): string | null {
  if (!pageUri) return null;
  if (!isPinakesConfigured) return pageUri;
  if (read.data) return getActionUri(read.data, pageUri);
  return read.isLoading ? null : pageUri;
}
