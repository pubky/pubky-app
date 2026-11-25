import { getResourceTarget } from '@/molecules/ResourceCard/ResourceCard.utils';
import type { TPinakesResourceDetail } from '@/services/pinakes/pinakes.types';

/**
 * The link the page's thread is on (its replies, the composer's `parent`, Participants): the link to
 * act on (`getResourceTarget`: the page's own link folded, with or without a card; for an identifier,
 * a web link of its card once it is read, its other spellings' replies read along); `null` while
 * the card is read or without a link, so the thread is not read twice for two links.
 */
export function getThreadUri(
  pageUri: string | null,
  read: { data: TPinakesResourceDetail | null | undefined; isLoading: boolean },
  isPinakesConfigured: boolean,
): string | null {
  if (!pageUri) return null;
  if (isPinakesConfigured && !read.data && read.isLoading) return null;
  return getResourceTarget(isPinakesConfigured ? read.data : null, pageUri).uri;
}
