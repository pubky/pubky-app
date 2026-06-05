import type { Pubky } from '@/models/models.types';

export interface CollectionItemsProps {
  /** Collection owner pubky. */
  authorPubky: Pubky;
  /** Collection post id (raw, not composite). */
  postId: string;
}
