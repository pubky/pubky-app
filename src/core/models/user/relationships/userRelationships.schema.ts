import * as Core from '@/core';

export interface UserRelationshipsModelSchema extends Core.NexusUserRelationship {
  id: Core.Pubky;
}

// Keep only the primary key index. Relationship flags are read by id.
export const userRelationshipsTableSchema = `
  &id
`;
