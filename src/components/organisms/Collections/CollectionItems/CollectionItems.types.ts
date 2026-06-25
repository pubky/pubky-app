import type { RefObject } from 'react';
import type { EnrichedPostDetails } from '@/application/moderation/moderation.types';
import type { Pubky } from '@/models/models.types';

export interface CollectionItemsProps {
  /** Collection owner pubky. */
  authorPubky: Pubky;
  /** Collection post id (raw, not composite). */
  postId: string;
  /** Loaded collection envelope from the page shell (shared with `CollectionHero`). */
  postDetails: EnrichedPostDetails | null | undefined;
  /** Optional page-level container for collection pull-to-refresh gestures. */
  pullToRefreshContainerRef?: RefObject<HTMLElement | null>;
}
