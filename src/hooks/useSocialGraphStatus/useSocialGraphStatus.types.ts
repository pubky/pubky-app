import type { NexusSocialGraphStatus } from '@/services/nexus/nexus.types';

/**
 * Result of the useSocialGraphStatus hook
 */
export interface UseSocialGraphStatusResult {
  /** Badge tier, or null when Nexus has no ranking for the user (or it is not known yet) */
  status: NexusSocialGraphStatus | null;
  /** Whether the tier is still being resolved (local read pending, or first fetch in flight) */
  isLoading: boolean;
}
