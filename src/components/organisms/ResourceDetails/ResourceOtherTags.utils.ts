import type {
  TMergedTag,
  TMergedTagSource,
  TOtherLink,
  TOtherLinkTags,
} from '@/hooks/useOtherLinkTags/useOtherLinkTags.types';
import { canonicalizeTagLabel } from '@/libs/utils/utils';
import { getAlsoOnName } from '@/molecules/ResourceCard/ResourceCard.utils';
import type { TPinakesCard, TPinakesResourceDetail } from '@/services/pinakes/pinakes.types';

/** Links read for their tags at most: a place can be on dozens of services (Wikipedia editions). */
export const MAX_OTHER_LINKS = 40;

/**
 * The URIs that are the page's link itself: its tags are the "Tags on this …" bar, so they are not
 * read again as another link's. The page's link, the link acted on, the card's canonical link, the
 * links people wrote for it (`refs`) and its other spellings (`aliases`).
 */
export function getOwnLinkUris(
  card: Pick<TPinakesResourceDetail, 'uri' | 'refs'> & Partial<Pick<TPinakesResourceDetail, 'aliases'>>,
  pageUri: string,
  actionUri: string,
): Set<string> {
  return new Set([pageUri, actionUri, card.uri, ...card.refs, ...(card.aliases ?? [])]);
}

/**
 * The other links of the same thing whose tags are read, by URI: every other member of the card's
 * group (the links people wrote for it first, then its canonical link), then the card's Also on
 * entries, the same way (an entry's `refs`, then its link), so a card needs no group read. A derived
 * Also on entry is left out, refs and all: Pinakes found it through a source and nobody has tagged
 * it. Own URIs and repeats are skipped; at most `MAX_OTHER_LINKS`.
 *
 * @param members - The group's members (`GET /v1/groups/{id}`), the card itself among them; absent
 *   while read or for a card outside a group
 */
export function getOtherLinks(
  card: Pick<TPinakesResourceDetail, 'id' | 'also_on'>,
  members: Pick<TPinakesCard, 'id' | 'uri' | 'refs' | 'site'>[] | null | undefined,
  ownUris: ReadonlySet<string>,
): TOtherLink[] {
  const links = new Map<string, TOtherLink>();
  const add = (uri: string, site: string | null | undefined) => {
    if (!uri || ownUris.has(uri) || links.has(uri) || links.size >= MAX_OTHER_LINKS) return;
    links.set(uri, { uri, name: getAlsoOnName({ uri, site }) });
  };
  for (const member of members ?? []) {
    if (member.id === card.id) continue;
    for (const ref of member.refs ?? []) add(ref, member.site);
    add(member.uri, member.site);
  }
  for (const entry of card.also_on) {
    if (entry.derived) continue;
    for (const ref of entry.refs ?? []) add(ref, entry.site);
    add(entry.uri, entry.site);
  }
  return [...links.values()];
}

/**
 * Merges the tags of the other links (`getOtherLinks`, which already leaves out the page link's own
 * URIs) into one chip per label, labels compared as Nexus stores them, case-folded: taggers are
 * joined so a person who put the same tag on two links counts once, and each chip keeps the links
 * it came from, once each, with the taggers listed there (two spellings of a label on one link are
 * joined, keeping the larger count), so a detail can say who put it where. A chip is the viewer's
 * when Nexus marks the label theirs on any of the links (`relationship`, exact even when its sample of
 * taggers left them out). Most taggers first, then on most links, then by label.
 */
export function mergeOtherLinkTags(reads: TOtherLinkTags[]): TMergedTag[] {
  const merged = new Map<
    string,
    {
      taggers: Set<string>;
      most: number;
      isComplete: boolean;
      relationship: boolean;
      sources: Map<string, TMergedTagSource>;
    }
  >();
  for (const { link, tags } of reads) {
    for (const tag of tags) {
      const label = canonicalizeTagLabel(tag.label);
      if (!label) continue;
      const entry = merged.get(label) ?? {
        taggers: new Set<string>(),
        most: 0,
        isComplete: true,
        relationship: false,
        sources: new Map(),
      };
      for (const tagger of tag.taggers) entry.taggers.add(tagger);
      const count = Math.max(tag.taggers_count, tag.taggers.length);
      entry.most = Math.max(entry.most, count);
      entry.isComplete &&= tag.taggers.length >= tag.taggers_count;
      entry.relationship ||= tag.relationship;
      const source = entry.sources.get(link.uri);
      const taggers = [...new Set([...(source?.taggers ?? []), ...tag.taggers])];
      entry.sources.set(link.uri, { ...link, count: Math.max(source?.count ?? 0, count, taggers.length), taggers });
      merged.set(label, entry);
    }
  }
  return [...merged.entries()]
    .map(([label, { taggers, most, isComplete, relationship, sources }]) => ({
      label,
      taggers: [...taggers],
      count: Math.max(taggers.size, most),
      isComplete,
      relationship,
      sources: [...sources.values()].sort(bySourceCount),
    }))
    .sort(byMergedTagOrder);
}

const bySourceCount = (a: TMergedTagSource, b: TMergedTagSource) => b.count - a.count;

/** Most taggers first, then on most links, then by label. */
const byMergedTagOrder = (a: TMergedTag, b: TMergedTag) =>
  b.count - a.count || b.sources.length - a.sources.length || a.label.localeCompare(b.label);

/**
 * Two lists merged apart (`mergeOtherLinkTags`) of different links, as one merge of all of them: the
 * resource page's other links' tags and a series feed's, read by another reader. A person on links of
 * both counts once; `list` itself when nothing is joined to it.
 */
export function joinMergedTags(list: readonly TMergedTag[], more: readonly TMergedTag[]): readonly TMergedTag[] {
  if (more.length === 0) return list;
  const joined = new Map(list.map((tag) => [tag.label, tag]));
  for (const tag of more) {
    const prev = joined.get(tag.label);
    if (!prev) {
      joined.set(tag.label, tag);
      continue;
    }
    const taggers = [...new Set([...prev.taggers, ...tag.taggers])];
    const sources = [...prev.sources, ...tag.sources].sort(bySourceCount);
    joined.set(tag.label, {
      label: tag.label,
      taggers,
      // As one merge counts: each tagger once, at least the most any one link has
      count: Math.max(taggers.length, ...sources.map((source) => source.count)),
      isComplete: prev.isComplete && tag.isComplete,
      relationship: Boolean(prev.relationship || tag.relationship),
      sources,
    });
  }
  return [...joined.values()].sort(byMergedTagOrder);
}
