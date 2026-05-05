import type { Pubky } from '@/models/models.types';
import type { TaggerWithAvatar } from '@/molecules/TaggedItem/TaggedItem.types';

export interface WhoTaggedExpandedListProps {
  /** Tagger IDs to render */
  taggerIds: Pubky[];
  /** Fallback tagger data when user details are missing */
  fallbackTaggers?: TaggerWithAvatar[];
  /** Whether taggers are currently loading */
  isLoadingTaggers?: boolean;
  /** Test ID */
  'data-testid'?: string;
}
