'use client';

import { usePinakesGroup } from '@/hooks/usePinakesGroup/usePinakesGroup';
import {
  PinakesCreditField,
  PinakesStatus,
  type TPinakesCard,
  type TPinakesCredit,
} from '@/services/pinakes/pinakes.types';
import { getHttpUrl, getLinkHost } from './ResourceCard.utils';

/**
 * A value a card borrows from another member of its group. The card shows it without naming that
 * member's service; only a credit the member has for it (a licence that asks for one) is shown.
 */
export interface TBorrowedValue {
  value: string;
  /** The member's own credit for the value, shown with it when it has one. */
  credit: TPinakesCredit | null;
}

export interface TResourceFallback {
  description: TBorrowedValue | null;
  image: TBorrowedValue | null;
  /** The group is still being read: what it lends is not known yet. */
  pending: boolean;
}

const NONE: TResourceFallback = { description: null, image: null, pending: false };

/**
 * The open general databases a card may borrow from, their subdomains included: MusicBrainz and its
 * Cover Art Archive, Wikidata, Wikimedia (Commons), Wikipedia, OpenStreetMap and Open Library. A store
 * or streaming service (Apple Music, Spotify, TIDAL, Deezer, YouTube, Amazon Music, Qobuz,
 * SoundCloud, Bandcamp, …) lends nothing: its text and picture stay on its own card, never on
 * another platform's link.
 */
const GENERAL_DATABASE_HOSTS: readonly string[] = [
  'musicbrainz.org',
  'coverartarchive.org',
  'wikidata.org',
  'wikimedia.org',
  'wikipedia.org',
  'openstreetmap.org',
  'openlibrary.org',
];

/** A member on a `GENERAL_DATABASE_HOSTS` host, or a book's `isbn:` card (Open Library's record). */
function isGeneralDatabase(uri: string): boolean {
  if (/^isbn:/i.test(uri)) return true;
  const host = getLinkHost(uri);
  return !!host && GENERAL_DATABASE_HOSTS.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

function borrow(member: TPinakesCard, value: string, field: PinakesCreditField): TBorrowedValue {
  return { value, credit: member.credits?.find((credit) => credit.field === field) ?? null };
}

/**
 * What a sparse card borrows from its group (the same thing on other services, `/v1/groups/{id}`)
 * when it lacks a description or an image: the first member that is `ok`, is a general database's
 * record (`isGeneralDatabase`) and has one, members of the card's own type first. A group of
 * services only lends nothing, and the card leaves that slot empty. The group is read only for a
 * card in a group that lacks one of them, once per group (the query is shared with the resource
 * page's group list). Never across `maybe_same`: those are not confirmed to be the same thing.
 *
 * @param card - The card being shown
 * @param needs - Which values the card lacks, and images that failed to load (not offered again)
 */
export function useResourceFallback(
  card: Pick<TPinakesCard, 'id' | 'type' | 'group'>,
  needs: { description: boolean; image: boolean; skipImages?: readonly string[] },
): TResourceFallback {
  // A group of one has nobody to borrow from.
  const hasOthers = (card.group?.size ?? 0) > 1;
  const groupId = hasOthers && (needs.description || needs.image) ? card.group?.id : null;
  const { data: group, isLoading } = usePinakesGroup(groupId);
  if (!groupId) return NONE;
  if (!group) return { ...NONE, pending: isLoading };

  const members = group.members
    .filter((member) => member.id !== card.id && member.status === PinakesStatus.OK && isGeneralDatabase(member.uri))
    // Same type first; `sort` is stable, so the group's own order stays within each part.
    .sort((a, b) => Number(b.type === card.type) - Number(a.type === card.type));

  let description: TBorrowedValue | null = null;
  let image: TBorrowedValue | null = null;
  for (const member of members) {
    const text = member.description?.trim();
    if (needs.description && !description && text) description = borrow(member, text, PinakesCreditField.DESCRIPTION);
    const memberImage = getHttpUrl(member.image);
    const usable = memberImage && !needs.skipImages?.includes(memberImage) ? memberImage : null;
    if (needs.image && !image && usable) image = borrow(member, usable, PinakesCreditField.IMAGE);
  }
  return { description, image, pending: false };
}
