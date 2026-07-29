import type { EnrichedPostDetails } from '@/application/moderation/moderation.types';
import type { CollectionLayout } from '@/config/collections';
import type { Pubky } from '@/models/models.types';

export interface CollectionHeroProps {
  /** Collection owner pubky. */
  authorPubky: Pubky;
  /** Collection post id (raw, not composite). */
  postId: string;
  /** Loaded collection envelope from the page shell (avoids a duplicate `usePostDetails` fetch). */
  postDetails: EnrichedPostDetails | null | undefined;
  /** Collection-scoped viewer layout selection. */
  layout: CollectionLayout;
  /** Updates the temporary viewer selection without persisting it. */
  onLayoutChange: (layout: CollectionLayout) => void;
  className?: string;
}

export interface CollectionHeroContentProps extends CollectionHeroProps {
  /** `author:postId` composite id, derived once by the shell. */
  compositeId: string;
  /** Loaded post envelope — non-null by construction (shell renders the skeleton otherwise). */
  postDetails: EnrichedPostDetails;
}
