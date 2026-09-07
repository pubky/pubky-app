import type { NexusSocialGraphStatus, NexusUserDetails } from '@/services/nexus/nexus.types';

export type UserDetailsModelSchema = NexusUserDetails & {
  /**
   * Social graph badge tier, folded in from the Nexus user view (`social_graph_status`)
   * when a full user is persisted. Absent when the row came from a details-only fetch,
   * so the tier is unknown; `null` when Nexus has no ranking for the user.
   */
  social_graph_status?: NexusSocialGraphStatus | null;
};

// Keep only the primary key index. Profile fields are read by id.
export const userDetailsTableSchema = `
  &id
`;
