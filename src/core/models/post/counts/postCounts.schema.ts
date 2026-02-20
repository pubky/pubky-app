import * as Core from '@/core';

export interface PostCountsModelSchema extends Core.NexusPostCounts {
  id: string;
}

// Keep only the primary key index. Count fields are read/updated by id.
export const postCountsTableSchema = `
  &id,
  tags,
  unique_tags,
  reposts,
  replies
`;
