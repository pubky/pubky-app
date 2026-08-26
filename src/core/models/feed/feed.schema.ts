import { PubkyAppFeedLayout, PubkyAppFeedReach, PubkyAppFeedSort, PubkyAppPostKind } from 'pubky-app-specs';

export interface FeedModelSchema {
  id: string;
  name: string;
  /**
   * Lucide icon name in kebab-case.
   * Optional because feeds created before pubky-app-specs 0.7 have no icon.
   */
  icon?: string;
  tags: string[];
  domain_tags: string[];
  reach: PubkyAppFeedReach;
  sort: PubkyAppFeedSort;
  content: PubkyAppPostKind | null;
  layout: PubkyAppFeedLayout;
  created_at: number;
  updated_at: number;
}

// Schema design rationale:
// - &id: Primary key (string, HashId-derived)
// - created_at: For sorting feeds by creation time
export const feedTableSchema = '&id, created_at';
