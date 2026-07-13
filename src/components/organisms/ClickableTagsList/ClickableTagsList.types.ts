import type { MouseEvent } from 'react';
import type { TagKind } from '@/application/tag/tag.types';
import type { TagWithAvatars } from '@/molecules/TaggedItem/TaggedItem.types';
import type { NexusTag } from '@/services/nexus/nexus.types';

export interface ClickableTagsListProps {
  /** The ID of the tagged entity (userId or postId) */
  taggedId: string;
  /** The kind of the tagged entity */
  taggedKind: TagKind;
  /** Optional: pre-loaded tags (if not provided, will fetch from IndexedDB) */
  tags?: NexusTag[];
  /** Maximum number of tags to display */
  maxTags?: number;
  /** Maximum character length per tag */
  maxTagLength?: number;
  /** Maximum total characters across all tags */
  maxTotalChars?: number;
  /** Whether to show the tag count badge */
  showCount?: boolean;
  /**
   * Show the add tag input directly.
   * Note: showInput and showAddButton are mutually exclusive - use one or the other.
   */
  showInput?: boolean;
  /**
   * Show add button instead of input.
   * Note: showInput and showAddButton are mutually exclusive - use one or the other.
   */
  showAddButton?: boolean;
  /** Start in add button mode and open input on click (used with showAddButton) */
  addMode?: boolean;
  /** When true, tags render without toggle/add interactions (display only). */
  readOnly?: boolean;
  /** Show close button on tags */
  showTagClose?: boolean;
  /** Custom className */
  className?: string;
  /** Callback when a tag is clicked (optional, defaults to toggle) */
  onTagClick?: (tag: TagWithAvatars, index: number, event: MouseEvent) => void;
  /** Callback when a tag close button is clicked */
  onTagClose?: (tag: TagWithAvatars, index: number, event: MouseEvent) => void;
  /** Callback when a new tag is added. If not provided, uses internal handleTagAdd. */
  onTagAdd?: (label: string) => void;
  /** Callback when add button is clicked */
  onAddButtonClick?: () => void;
}
