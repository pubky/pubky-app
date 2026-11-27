import type { KnownFeedLayout, KnownFeedReach, KnownFeedSort, KnownPostKind } from 'pubky-social-specs';

export interface FeedModelSchema {
  id: string;
  name: string;
  /**
   * Lucide icon name in kebab-case.
   * Optional because 0.x feeds created before the 0.7 spec added icons have none.
   */
  icon?: string;
  tags: string[];
  domain_tags: string[];
  reach: KnownFeedReach;
  sort: KnownFeedSort;
  content: KnownPostKind | null;
  layout: KnownFeedLayout;
  created_at: number;
  updated_at: number;
}

// Schema design rationale:
// - &id: Primary key (string, HashId-derived)
// - created_at: For sorting feeds by creation time
export const feedTableSchema = '&id, created_at';
