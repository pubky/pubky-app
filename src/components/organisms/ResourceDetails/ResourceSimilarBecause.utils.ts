import type { NexusTag } from '@/services/nexus/nexus.types';

/** The top tags a Similar row's line shows. */
export const BECAUSE_TOP_TAGS = 1;

/**
 * The link's labels to show, at most `BECAUSE_TOP_TAGS`: those the shared people put on it first
 * (as far as Nexus' tagger sample shows), then by taggers, then by label.
 */
export function topTags(tags: NexusTag[], shared: string[] = [], limit: number = BECAUSE_TOP_TAGS): string[] {
  const byShared = (tag: NexusTag) => (tag.taggers.some((id) => shared.includes(id)) ? 0 : 1);
  return [...tags]
    .sort((a, b) => byShared(a) - byShared(b) || b.taggers_count - a.taggers_count || a.label.localeCompare(b.label))
    .slice(0, limit)
    .map((tag) => tag.label);
}

/** The avatars button's accessible name: the sentence the line stands for. */
export function becauseLabel({ shared, name, top }: { shared: number; name: string; top: string[] }): string {
  const who = `${shared} ${shared === 1 ? 'person' : 'people'} who tagged this also tagged ${name}`;
  const tags = top.length > 0 ? `. Its top tags: ${top.join(', ')}` : '';
  return `${who}${tags}. Show who`;
}
