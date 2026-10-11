export interface TPostCountsParams {
  postCompositeId: string;
  countChanges: TPostCountsCountChanges;
}

export interface TPostCountsCountChanges {
  replies?: number;
  reposts?: number;
  tags?: number;
  unique_tags?: number;
  collections?: number;
}
