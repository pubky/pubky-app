import { canonicalizeTagLabel } from '@/libs/utils/utils';
import type { Pubky } from '@/models/models.types';
import type { NexusTag } from '@/services/nexus/nexus.types';

export type TResourceViewerTag = {
  /** The label as stored (`TagNormalizer.to` folds it). */
  label: string;
  viewerId: Pubky;
  /** The viewer's tag file: set by an add, ignored by a remove. */
  tagUri?: string | null;
};

/**
 * The tags of an external resource after the viewer added (`isAdded`) or removed their tag with
 * `label`: what Nexus will answer once it indexed the write. A label the viewer already holds (or
 * no longer holds) leaves the list as it is; a label nobody else tags disappears on removal, and a
 * new label goes last.
 *
 * Pure: the same reconciliation serves the card's state and the shared Nexus query cache.
 */
export function withResourceViewerTag(
  tags: readonly NexusTag[],
  { label, viewerId, tagUri = null }: TResourceViewerTag,
  isAdded: boolean,
): NexusTag[] {
  const key = canonicalizeTagLabel(label);
  const index = tags.findIndex((tag) => canonicalizeTagLabel(tag.label) === key);
  const current = index === -1 ? undefined : tags[index];

  if (isAdded) {
    if (current?.relationship) return [...tags];
    if (!current) {
      return [...tags, { label: key, taggers: [viewerId], taggers_count: 1, relationship: true, tag_uri: tagUri }];
    }
    const next: NexusTag = {
      ...current,
      taggers: [viewerId, ...current.taggers.filter((tagger) => tagger !== viewerId)],
      taggers_count: current.taggers_count + 1,
      relationship: true,
      tag_uri: tagUri,
    };
    return tags.map((tag, position) => (position === index ? next : tag));
  }

  if (!current?.relationship) return [...tags];
  const taggersCount = Math.max(0, current.taggers_count - 1);
  if (taggersCount === 0) return tags.filter((_, position) => position !== index);
  const next: NexusTag = {
    ...current,
    taggers: current.taggers.filter((tagger) => tagger !== viewerId),
    taggers_count: taggersCount,
    relationship: false,
    tag_uri: null,
  };
  return tags.map((tag, position) => (position === index ? next : tag));
}
