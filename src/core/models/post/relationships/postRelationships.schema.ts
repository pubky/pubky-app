import * as Core from '@/core';

export interface PostRelationshipsModelSchema extends Core.NexusPostRelationships {
  id: string;
}

// Keep the reply index for "get replies by parent post" queries.
export const postRelationshipsTableSchema = `
  &id,
  replied
`;
