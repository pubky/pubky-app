import type { Pubky } from '@/models/models.types';
import type { TaggerWithAvatar } from '@/molecules/TaggedItem/TaggedItem.types';

export interface WhoTaggedExpandedListProps {
  /** Tagger IDs to render */
  taggerIds: Pubky[];
  /** Fallback tagger data when user details are missing */
  fallbackTaggers?: TaggerWithAvatar[];
  /** Whether the first page of taggers is loading (renders the skeleton) */
  isLoadingTaggers?: boolean;
  /** Whether a further page is loading (renders a loading row below the list) */
  isLoadingMore?: boolean;
  /** Whether more taggers can be loaded by scrolling to the bottom */
  hasMore?: boolean;
  /** Called when the bottom sentinel scrolls into view */
  onLoadMore?: () => void;
  /** Test ID */
  'data-testid'?: string;
}
