import { groupAlsoOn, pickAlsoOn, type TAlsoOnRow } from '@/molecules/ResourceCard/ResourceAlsoOn.utils';
import { getHttpUrl, getLinkHost, getResourceLinks } from '@/molecules/ResourceCard/ResourceCard.utils';
import type { TPinakesAlsoOn, TPinakesCard, TPinakesResourceDetail } from '@/services/pinakes/pinakes.types';

type TGroupMember = Pick<TPinakesCard, 'id' | 'uri' | 'site'>;

/** Where a link people shared on Pubky came from, in its row's tooltip. */
export const SHARED_ON_PUBKY_NOTE = 'Shared on Pubky';

/**
 * Where the row's link came from, for its tooltip only: shared on Pubky (a tagged member) or the
 * source Pinakes found it through. The list shows the service alone.
 */
export function getAlsoOnSource(entry: TPinakesAlsoOn): string | null {
  if (entry.id) return SHARED_ON_PUBKY_NOTE;
  if (!entry.derived) return null;
  const via = entry.via?.trim();
  return via ? `Found via ${via}` : 'Found automatically';
}

/**
 * A link compared as the same link however it is written: an `http(s)` link by its host without
 * `www.` (`http` and `https` alike), its path without a trailing slash, and its query (not its
 * fragment); any other URI as written, case-folded (`ISBN:…`, `doi:…`).
 */
export function getLinkKey(uri: string): string {
  const href = getHttpUrl(uri);
  if (!href) return uri.trim().toLowerCase();
  const { pathname, search } = new URL(href);
  return `${getLinkHost(href)}${pathname.replace(/\/+$/, '')}${search}`;
}

/**
 * The resource page's Also on, one row per service (`pickAlsoOn`, `groupAlsoOn`): Pinakes' entries
 * first, then the group members shared on Pubky for a service Pinakes has no link for. Never the
 * card's own links (`getLinkKey`) or the service its header opens.
 *
 * @param members - The group's members (`GET /v1/groups/{id}`), the card among them; absent while
 *   read, when the read failed, or for a card outside a group (then Also on alone)
 */
export function mergeAlsoOn(
  card: Pick<TPinakesResourceDetail, 'uri' | 'site' | 'refs' | 'also_on' | 'open_in'> & { aliases?: string[] | null },
  members: TGroupMember[] | null | undefined,
): TAlsoOnRow[] {
  const own = new Set([card.uri, ...card.refs, ...(card.aliases ?? [])].map(getLinkKey));
  const shared = (members ?? []).map((member): TPinakesAlsoOn => ({
    uri: member.uri,
    id: member.id,
    site: member.site,
  }));
  const entries = [...card.also_on, ...shared].filter((entry) => !own.has(getLinkKey(entry.uri)));
  // The service left out is the one the card's header opens; the other services people wrote links
  // for (`refs`: an ISBN reached through Goodreads and Open Library) stay.
  const { linkUrl, siteName } = getResourceLinks(card);
  return groupAlsoOn(pickAlsoOn(entries, { site: siteName, uris: [card.uri, linkUrl] }));
}
