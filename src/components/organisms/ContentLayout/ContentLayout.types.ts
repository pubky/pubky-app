import type { TimelineFeedVariant } from '@/config/feed';
import type { LayoutType } from '@/stores/home/home.types';

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
  /** Whether the MobileHeader uses a gradient background or a solid one. Defaults to true. */
  hasGradientBackground?: boolean;
  className?: string;
  classNameWrapperContent?: string;
  classNameMobileHeader?: string;
  feedVariant?: TimelineFeedVariant;
  /** Temporary page-level layout that takes precedence over persisted feed preferences. */
  layoutOverride?: LayoutType;
  /** Render page-local chrome as columns even when the persisted feed preference is wide. */
  disableWideShellLayout?: boolean;
}

export interface StickySidebarProps {
  children: React.ReactNode;
}
