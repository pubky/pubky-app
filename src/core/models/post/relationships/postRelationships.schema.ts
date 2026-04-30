import type { NexusPostRelationships } from '@/services/nexus/nexus.types';
export interface PostRelationshipsModelSchema extends NexusPostRelationships {
  id: string;
}

// Keep the reply index for "get replies by parent post" queries.
// Keep the reposted index for local lookups by original post URI.
export const postRelationshipsTableSchema = `
  &id,
  replied,
  reposted
`;
