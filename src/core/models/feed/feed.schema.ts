import { PubkyAppFeedLayout, PubkyAppFeedReach, PubkyAppFeedSort, PubkyAppPostKind } from 'pubky-app-specs';

export interface FeedModelSchema {
  id: string;
  name: string;
  tags: string[];
  reach: PubkyAppFeedReach;
  sort: PubkyAppFeedSort;
  content: PubkyAppPostKind | null;
  layout: PubkyAppFeedLayout;
  created_at: number;
  updated_at: number;
}

// Schema design rationale:
// - &id: Primary key (string, HashId-derived)
// - created_at: Indexed for sorted queries (findAllSorted)
export const feedTableSchema = '&id, created_at';
