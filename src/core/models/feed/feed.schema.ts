import { PubkyAppFeedLayout, PubkyAppFeedReach, PubkyAppFeedSort, PubkyAppPostKind } from 'pubky-app-specs';

export interface FeedModelSchema {
  id: number;
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
// - ++id: Auto-incrementing primary key (like notifications)
// - name: Used for indexed name lookup
// - created_at: For sorting feeds by creation time
// - updated_at: For sorting feeds by most recently modified
export const feedTableSchema = '++id, name, created_at, updated_at';
