import type { Pubky } from '@/models/models.types';
import type { TaggerWithAvatar } from '@/molecules/TaggedItem/TaggedItem.types';

export interface WhoTaggedExpandedListProps {
  /** Tagger IDs to render */
  taggerIds: Pubky[];
  /** Fallback tagger data when user details are missing */
  fallbackTaggers?: TaggerWithAvatar[];
  /** Initial loading preserves available previews; otherwise shows a skeleton. */
  isLoadingTaggers?: boolean;
  /** Loading another page or refreshing existing rows. */
  isLoadingMore?: boolean;
  /** Whether more taggers can be loaded by scrolling to the bottom */
  hasMore?: boolean;
  /** Pauses automatic loading and offers a manual retry. */
  hasError?: boolean;
  /** Called when the bottom sentinel scrolls into view */
  onLoadMore?: () => void;
  /** Test ID */
  'data-testid'?: string;
}
