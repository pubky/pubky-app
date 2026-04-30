import type { NexusUserDetails } from '@/services/nexus/nexus.types';
export type UserDetailsModelSchema = NexusUserDetails;

// Keep only the primary key index. Profile fields are read by id.
export const userDetailsTableSchema = `
  &id
`;
