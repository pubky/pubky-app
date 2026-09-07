import type { NexusSocialGraphStatus } from '@/services/nexus/nexus.types';

export interface SocialGraphBadgeProps {
  /** Badge tier decided by Nexus */
  status: NexusSocialGraphStatus;
  className?: string;
}
