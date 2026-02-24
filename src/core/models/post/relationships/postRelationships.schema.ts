import * as Core from '@/core';

export interface PostRelationshipsModelSchema extends Core.NexusPostRelationships {
  id: string;
}

// Keep the reply index for "get replies by parent post" queries.
// Keep the reposted index for local lookups by original post URI.
export const postRelationshipsTableSchema = `
  &id,
  replied,
  reposted
`;
