import type { Pubky } from '@/core';
import type { TaggerWithAvatar } from '@/molecules/TaggedItem/TaggedItem.types';

export interface WhoTaggedExpandedListProps {
  /** Tagger IDs to render */
  taggerIds: Pubky[];
  /** Fallback tagger data when user details are missing */
  fallbackTaggers?: TaggerWithAvatar[];
  /** Whether taggers are currently loading */
  isLoadingTaggers?: boolean;
  /** Optional custom className to override default container styles */
  className?: string;
  /** Test ID */
  'data-testid'?: string;
}
