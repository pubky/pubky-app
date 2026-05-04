import type { LucideProps } from 'lucide-react';
import type { NexusUserDetails } from '@/services/nexus/nexus.types';
export interface ProfilePageSidebarLink {
  icon: React.ComponentType<LucideProps>;
  url: string;
  label: string;
}
export interface ProfilePageLinksProps {
  links?: NexusUserDetails['links'];
  /** Whether the user is viewing their own profile */
  isOwnProfile?: boolean;
}
