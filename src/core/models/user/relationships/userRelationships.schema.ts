import * as Core from '@/core';

export interface UserRelationshipsModelSchema extends Core.NexusUserRelationship {
  id: Core.Pubky;
}

// Primary and compound indexes for Dexie
export const userRelationshipsTableSchema = `
  &id,
  following,
  followed_by
`;
