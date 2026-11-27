import type { TMergedTag, TOtherLink } from '@/hooks/useOtherLinkTags/useOtherLinkTags.types';
import { canonicalizeTagLabel, isValidTagLabel } from '@/libs/utils/utils';
import type { NexusTag } from '@/services/nexus/nexus.types';

/** Tags only on the same thing's other links shown at most, as many as the link's own tag bar asks for. */
export const MAX_OTHER_TAGS = 20;

/** Suggested tags (a catalogue's labels for the card) shown at most, once the tags are expanded. */
export const MAX_SUGGESTED_TAGS = 10;

/**
 * The suggested tags of a card: its catalogue's labels (Pinakes `labels`) as the tags they would be
 * written as (`canonicalizeTagLabel`), each once, in Pinakes' order, without the labels a chip of the
 * bar shows (`taken`: its own tags, and the other services' it lists) and any that is no valid tag label.
 */
export function getSuggestedTags(labels: readonly string[] | null | undefined, taken: readonly string[]): string[] {
  const shown = new Set(taken.map(canonicalizeTagLabel));
  const suggestions: string[] = [];
  for (const raw of labels ?? []) {
    if (suggestions.length === MAX_SUGGESTED_TAGS) break;
    if (typeof raw !== 'string') continue;
    const label = canonicalizeTagLabel(raw);
    if (!isValidTagLabel(label) || shown.has(label)) continue;
    shown.add(label);
    suggestions.push(label);
  }
  return suggestions;
}

/** Someone in a tag's detail, with the same thing's other links they put the tag on. */
export interface TTagPerson {
  id: string;
  /** The other links (`mergeOtherLinkTags` sources) Nexus lists this person on for the tag. */
  links: TOtherLink[];
}

/** Who put one tag on the link and on the same thing's other links, each person once. */
export interface TTagPeople {
  /** The people Nexus lists for the tag on the link itself (they may have put it elsewhere too). */
  here: TTagPerson[];
  /** The people Nexus lists for it only on other links. */
  elsewhere: TTagPerson[];
  /**
   * People with the tag on any of the links, each once: exact when Nexus listed every tagger,
   * else at least the most any one read counts (`isComplete` false).
   */
  total: number;
  isComplete: boolean;
}

/**
 * Who put a label on the link (`own`, absent when only other links have it) and on the same thing's
 * other links (`other`, from `mergeOtherLinkTags`): the link's own taggers first, then the people
 * who put it only elsewhere, each with the other links they put it on.
 */
export function getTagPeople(
  own: Pick<NexusTag, 'taggers' | 'taggers_count'> | undefined,
  other: TMergedTag,
): TTagPeople {
  const linksOf = (id: string): TOtherLink[] =>
    other.sources.filter((source) => source.taggers.includes(id)).map(({ uri, name }) => ({ uri, name }));
  const hereIds = [...new Set(own?.taggers ?? [])];
  const isHere = new Set(hereIds);
  const here = hereIds.map((id) => ({ id, links: linksOf(id) }));
  const elsewhere = other.taggers.filter((id) => !isHere.has(id)).map((id) => ({ id, links: linksOf(id) }));
  const listed = here.length + elsewhere.length;
  const isComplete = other.isComplete && (own ? own.taggers.length >= own.taggers_count : true);
  return { here, elsewhere, total: Math.max(listed, own?.taggers_count ?? 0, other.count), isComplete };
}
