'use client';

import { useLayoutReset } from '@/hooks/useLayoutReset/useLayoutReset';
import { usePathname } from 'next/navigation';
import * as Organisms from '@/organisms';
import * as Molecules from '@/molecules';
import * as App from '@/app';
import type { SettingsProps } from './Settings.types';

/**
 * Settings page layout component.
 * Handles the overall structure including mobile menu, sidebars, and content area.
 * Uses ContentLayout for responsive sidebar/drawer behavior.
 */
export function Settings({ children }: SettingsProps) {
  const pathname = usePathname();
  const isOnHelpPage = pathname === App.SETTINGS_ROUTES.HELP;

  // Reset to column layout on mount (settings doesn't support wide layout)
  useLayoutReset();

  return (
    <>
      {/* Mobile header - rendered here for control over hasGradientBackground */}
      <Molecules.MobileHeader hasGradientBackground={false} showLeftButton={false} showRightButton={false} fixed />

      {/* Mobile tab navigation - visible only on mobile (< lg) */}
      <Molecules.SettingsMobileMenu />

      <Organisms.ContentLayout
        renderMobileHeader={false}
        showLeftMobileButton={false}
        showRightMobileButton={false}
        leftSidebarContent={<Molecules.SettingsMenu />}
        rightSidebarContent={<Molecules.SettingsInfo hideFAQ={isOnHelpPage} />}
        leftDrawerContent={<Molecules.SettingsMenu />}
        rightDrawerContent={<Molecules.SettingsInfo hideFAQ={isOnHelpPage} />}
        className="pt-[calc(var(--header-height-mobile)+5rem)] lg:pt-0"
      >
        {children}
      </Organisms.ContentLayout>
    </>
  );
}
