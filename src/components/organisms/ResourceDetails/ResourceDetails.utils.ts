import { getResourceTarget } from '@/molecules/ResourceCard/ResourceCard.utils';
import type { TPinakesResourceDetail } from '@/services/pinakes/pinakes.types';

/**
 * The link the page's thread is on (its replies, the composer's `parent`, Participants): the card's
 * canonical link once it is read (`getResourceTarget`, its other spellings' replies read along), the
 * page's own link without a card or Pinakes; `null` while the card is read or without a link, so the
 * thread is not read twice for two links.
 */
export function getThreadUri(
  pageUri: string | null,
  read: { data: TPinakesResourceDetail | null | undefined; isLoading: boolean },
  isPinakesConfigured: boolean,
): string | null {
  if (!pageUri) return null;
  if (!isPinakesConfigured) return pageUri;
  if (read.data) return getResourceTarget(read.data, pageUri).uri;
  return read.isLoading ? null : pageUri;
}
