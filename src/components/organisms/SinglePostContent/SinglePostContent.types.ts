import type { EnrichedPostDetails } from '@/application/moderation/moderation.types';

export interface SinglePostContentProps {
  /**
   * Composite ID of the post (author:postId format)
   */
  postId: string;
  /** Resolved post details (parent fetches via {@link usePostDetails}) */
  postDetails: EnrichedPostDetails;
}
