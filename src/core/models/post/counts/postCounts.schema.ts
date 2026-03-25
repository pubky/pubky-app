import * as Core from '@/core';

export interface PostCountsModelSchema extends Core.NexusPostCounts {
  id: string;
}

//  Primary and compound indexes for Dexie
// All the indexes are being used in queries
export const postCountsTableSchema = `
  &id,
  tags,
  unique_tags,
  reposts,
  replies
`;
