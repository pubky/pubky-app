import * as Core from '@/core';

export interface TagCollectionModelSchema<Id> {
  id: Id;
  tags: Core.NexusTag[];
}

// Keep only the primary key index. Tag arrays are read/updated by id.
export const tagCollectionTableSchema = `
  &id
`;
