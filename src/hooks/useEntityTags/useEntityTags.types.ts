import type { TagWithAvatars } from '@/molecules/TaggedItem/TaggedItem.types';
import type { NexusTag } from '@/services/nexus/nexus.types';
export interface UseEntityTagsOptions {
  /** Custom viewer ID (defaults to current user) */
  viewerId?: string;
  /** Tags to use instead of fetching (for controlled mode) */
  providedTags?: NexusTag[];
}

export interface UseEntityTagsResult {
  /** Array of tags with relationship and avatar data */
  tags: TagWithAvatars[];
  /** Total count of tags */
  count: number;
  /** Whether initial loading is in progress */
  isLoading: boolean;
  /** Whether the viewer is a tagger for a specific tag */
  isViewerTagger: (tag: TagWithAvatars) => boolean;
  /** Toggle tag (add/remove current user as tagger) */
  handleTagToggle: (tag: TagWithAvatars) => Promise<void>;
  /** Add a new tag */
  handleTagAdd: (label: string) => Promise<{ success: boolean; error?: string }>;
}
