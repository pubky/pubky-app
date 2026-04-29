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
  /** Whether taggers are currently loading */
  isLoadingTaggers?: boolean;
}
