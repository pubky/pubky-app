import type { Pubky } from '@/models/models.types';
import type { NexusUserRelationship } from '@/services/nexus/nexus.types';

export interface UserRelationshipsModelSchema extends NexusUserRelationship {
  id: Pubky;
}

// Keep only the primary key index. Relationship flags are read by id.
export const userRelationshipsTableSchema = `
  &id
`;
