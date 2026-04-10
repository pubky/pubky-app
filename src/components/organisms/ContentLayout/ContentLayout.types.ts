import type { TimelineFeedVariant } from '@/config';

export interface ContentLayoutProps {
  children: React.ReactNode;
  leftSidebarContent?: React.ReactNode;
  rightSidebarContent?: React.ReactNode;
  leftDrawerContent?: React.ReactNode;
  rightDrawerContent?: React.ReactNode;
  leftDrawerContentMobile?: React.ReactNode;
  rightDrawerContentMobile?: React.ReactNode;
  showLeftSidebar?: boolean;
  showRightSidebar?: boolean;
  showLeftMobileButton?: boolean;
  showRightMobileButton?: boolean;
  /** Whether to render the MobileHeader. Set to false when rendering MobileHeader externally (e.g., Settings page). Defaults to true. */
  renderMobileHeader?: boolean;
  className?: string;
  classNameWrapperContent?: string;
  feedVariant?: TimelineFeedVariant;
}

export interface StickySidebarProps {
  children: React.ReactNode;
}
