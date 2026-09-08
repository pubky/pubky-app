import type { NexusTag } from '@/services/nexus/nexus.types';

export interface TagMutation {
  viewerId: string;
  relationship: boolean;
  expiresAt: number;
  /** Optional only on legacy rows written before mutation identities existed. */
  id?: string;
  label?: string;
  /** Pending ownership survives expiry until settlement or replacement of the cached window. */
  synced?: boolean;
}

export interface TagCollectionModelSchema<Id> {
  id: Id;
  tags: NexusTag[];
  /** Server pagination is independent of optimistic additions/removals. Optional for legacy records. */
  cache?: {
    cursor: number;
    exhausted: boolean;
    fetchedAt: number;
    /** Earliest actual network request start in the accepted window. */
    validatedAt?: number;
    revision: number;
    /** Earliest background retry after a failed refresh; successful data clears it. */
    retryAt?: number;
    initialized?: boolean;
    viewerId?: string | null;
  };
  /** Local intent survives delayed Nexus responses, independently of server pagination. */
  mutations?: Record<string, TagMutation>;
}

// Keep only the primary key index. Tag arrays are read/updated by id.
export const tagCollectionTableSchema = `
  &id
`;
