import type { Pubky } from '@/models/models.types';

export interface TUserCountsParams {
  userId: Pubky;
  countChanges: TUserCountsCountChanges;
}

export interface TUserCountsCountChanges {
  tagged?: number;
  tags?: number;
  unique_tags?: number;
  posts?: number;
  replies?: number;
  following?: number;
  followers?: number;
  friends?: number;
  bookmarks?: number;
}
