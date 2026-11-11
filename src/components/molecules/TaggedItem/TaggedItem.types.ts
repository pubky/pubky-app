import type { Pubky } from '@/models/models.types';
import type { NexusTag } from '@/services/nexus/nexus.types';

export interface TaggerWithAvatar {
  id: Pubky;
  /** Avatar URL - may be undefined if user has no avatar */
  avatarUrl?: string;
  /** Optional display name for the user */
  name?: string;
}

export interface TagWithAvatars extends Omit<NexusTag, 'taggers'> {
  taggers: TaggerWithAvatar[];
  /**
   * People with the tag across the same thing's links (an external resource's page), each once:
   * shown muted after the count, and `taggers` then lists them all.
   */
  total?: number;
  /** On the same thing's other links only, not on this one yet: drawn as a secondary chip. */
  isSecondary?: boolean;
}

export interface TaggedItemProps {
  /** The tag data to display */
  tag: TagWithAvatars;
  /** Callback when the tag is clicked */
  onTagClick: (tag: TagWithAvatars) => void | Promise<void>;
  /** Optional callback when search button is clicked - if not provided, uses default search navigation */
  onSearchClick?: () => void;
  /** Hide avatar group (useful for sidebar/compact layouts) */
  hideAvatars?: boolean;
  /** Whether the user list is expanded (controlled mode) */
  isExpanded?: boolean;
  /** Callback when avatar group is clicked to toggle expand state */
  onExpandToggle?: (tagLabel: string) => void;
  /** Full tagger IDs for expanded list (optional) */
  expandedTaggerIds?: Pubky[];
  /** Whether the first page of taggers is currently loading */
  isLoadingTaggers?: boolean;
  /** Whether a further page of taggers is currently loading */
  isLoadingMoreTaggers?: boolean;
  /** Whether more taggers can be loaded for the expanded list */
  hasMoreTaggers?: boolean;
  hasTaggersError?: boolean;
  /** Callback to load the next page of taggers */
  onLoadMoreTaggers?: () => void;
  /** Shown in place of the expanded user list (e.g. the taggers grouped by where they tagged it) */
  expandedTaggers?: React.ReactNode;
}
