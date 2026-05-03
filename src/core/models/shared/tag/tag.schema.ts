import type { NexusTag } from '@/services/nexus/nexus.types';
export interface TagCollectionModelSchema<Id> {
  id: Id;
  tags: NexusTag[];
}

// Keep only the primary key index. Tag arrays are read/updated by id.
export const tagCollectionTableSchema = `
  &id
`;
