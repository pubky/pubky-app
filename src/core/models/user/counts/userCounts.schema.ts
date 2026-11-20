import type { Pubky } from '@/models/models.types';
import type { NexusUserCounts } from '@/services/nexus/nexus.types';

export interface UserCountsModelSchema extends Omit<NexusUserCounts, 'bookmarks'> {
  id: Pubky;
  /** Required on the row: `0` unless Nexus served the count (`/v0` only, ADR-0028). Every writer goes through `toSchema`. */
  bookmarks: number;
}

export type TUserCountsFields = keyof Omit<UserCountsModelSchema, 'id'>;

// Keep only the primary key index. Other counters are read/updated by id.
export const userCountsTableSchema = `
  &id
`;
