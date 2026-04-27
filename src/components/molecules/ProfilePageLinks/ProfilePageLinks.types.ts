import * as Core from '@/core';
import type { LucideProps } from 'lucide-react';
export interface ProfilePageSidebarLink {
  icon: React.ComponentType<LucideProps>;
  url: string;
  label: string;
}
export interface ProfilePageLinksProps {
  links?: Core.NexusUserDetails['links'];
  /** Whether the user is viewing their own profile */
  isOwnProfile?: boolean;
}
