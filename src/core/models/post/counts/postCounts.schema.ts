import type { NexusPostCounts } from '@/services/nexus/nexus.types';
export interface PostCountsModelSchema extends NexusPostCounts {
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
