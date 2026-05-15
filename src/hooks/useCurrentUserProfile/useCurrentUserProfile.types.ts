import type { NexusUserDetails } from '@/services/nexus/nexus.types';

export interface UseCurrentUserProfileResult {
  userDetails: NexusUserDetails | null | undefined;
  currentUserPubky: string | null;
}
