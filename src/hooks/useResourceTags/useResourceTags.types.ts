import type { NexusTag } from '@/services/nexus/nexus.types';

export interface UseResourceTagsOptions {
  /** `false` defers the read, e.g. until the card is first on screen; defaults to `true`. */
  enabled?: boolean;
}

/** What `TagInput` expects back: `{ success: false }` keeps the typed label in the input. */
export type TResourceTagWriteResult = { success: boolean };

export interface UseResourceTagsResult {
  /** The link's tags as Nexus reports them, with the viewer's writes applied; `[]` while loading. */
  tags: NexusTag[];
  isLoading: boolean;
  /**
   * Nexus is asked for at most `RESOURCE_TAGS_LIMIT` labels and answered with that many: the link may
   * have more, so a count of `tags` is a lower bound ("20+"), also after the viewer removed one.
   */
  isAtReadLimit: boolean;
  /** The read failed (already reported); `tags` is empty. */
  isError: boolean;
  /** Add the viewer's tag; a label they already hold is a no-op. */
  addTag: (label: string) => Promise<TResourceTagWriteResult>;
  /** Remove the viewer's tag with this label, or add it when they do not hold it. */
  toggleTag: (tag: Pick<NexusTag, 'label' | 'relationship' | 'tag_uri'>) => Promise<TResourceTagWriteResult>;
}
