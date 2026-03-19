import * as Core from '@/core';

export interface UserCountsModelSchema extends Core.NexusUserCounts {
  id: Core.Pubky;
}

export type TUserCountsFields = keyof Omit<UserCountsModelSchema, 'id'>;

// Keep only the primary key index. Other counters are read/updated by id.
export const userCountsTableSchema = `
  &id
`;
