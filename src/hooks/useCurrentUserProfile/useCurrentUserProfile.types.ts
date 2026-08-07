import type { NexusUserDetails } from '@/services/nexus/nexus.types';

export interface UseCurrentUserProfileResult {
  userDetails?: NexusUserDetails | null;
  currentUserPubky: string | null;
}
