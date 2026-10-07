import type { EnrichedPostDetails } from '@/application/moderation/moderation.types';

export type TagsLayout = 'inline' | 'side' | 'list';

export interface PostMainProps {
  postId: string;
  /** A parent that owns the details query can pass its settled result, including a missing post. */
  postDetails?: EnrichedPostDetails | null;
  presentation?: 'default' | 'cards';
  className?: string;
  isReply?: boolean;
  isLastReply?: boolean;
  pinActionsToBottom?: boolean;
  isNavigable?: boolean;
  showFullContentInListLayout?: boolean;
}
