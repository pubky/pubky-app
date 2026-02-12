import type { TagKind } from '@/core';
import type { TagWithAvatars } from '@/molecules/TaggedItem/TaggedItem.types';

export interface TaggedListProps {
  /** Array of tags to display */
  tags: TagWithAvatars[];
  /** Optional tagged entity ID (used for tagger expansion fetch) */
  taggedId?: string;
  /** Optional tagged entity kind (used for tagger expansion fetch) */
  taggedKind?: TagKind;
  /** Whether there are more tags to load */
  hasMore?: boolean;
  /** Whether currently loading more tags */
  isLoadingMore?: boolean;
  /** Function to load more tags */
  onLoadMore?: () => void;
  /** Function to toggle tag (add/remove as tagger) */
  onTagToggle: (tag: TagWithAvatars) => void | Promise<void>;
}
