import type { TagWithAvatars } from '@/molecules/TaggedItem/TaggedItem.types';

export interface UsePostTagsOptions {
  /** Custom viewer ID for relationship data (defaults to current user) */
  viewerId?: string | null;
  /**
   * Second post whose cached tags are read and merged into the list (e.g. the contentless
   * repost when the primary id is its original). Writes always target the primary id.
   */
  mergePostId?: string | null;
}

export interface UsePostTagsResult {
  /** Array of tags with avatar URLs */
  tags: TagWithAvatars[];
  /** Count of tags on this post */
  count: number;
  /** Loading state while fetching tags */
  isLoading: boolean;
  /** Loading state while fetching another page of tags */
  isLoadingMore: boolean;
  /** Whether more tags are available from the server */
  hasMore: boolean;
  /** Load the next page of tags */
  loadMore: () => Promise<void>;
  /** Function to add a new tag */
  handleTagAdd: (tagString: string) => Promise<{ success: boolean; error?: string }>;
  /** Function to toggle tag (add/remove as tagger) */
  handleTagToggle: (tag: { label: string; relationship?: boolean }) => Promise<void>;
}
