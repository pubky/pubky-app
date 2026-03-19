import * as Core from '@/core';

export type UserDetailsModelSchema = Core.NexusUserDetails;

// Keep only the primary key index. Profile fields are read by id.
export const userDetailsTableSchema = `
  &id
`;
