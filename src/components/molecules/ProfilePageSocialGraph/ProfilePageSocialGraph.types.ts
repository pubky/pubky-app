import type { NexusSocialGraphStatus } from '@/services/nexus/nexus.types';

export interface ProfilePageSocialGraphProps {
  /** Badge tier decided by Nexus; the section is not rendered when no tier is known */
  status: NexusSocialGraphStatus;
}
