import type { TaggerWithAvatar } from '@/molecules/TaggedItem/TaggedItem.types';

export interface WhoTaggedExpandedListProps {
  /** Array of users who tagged */
  taggers: TaggerWithAvatar[];
  /** Optional custom className to override default container styles */
  className?: string;
  /** Test ID */
  'data-testid'?: string;
}
