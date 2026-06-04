'use client';

import { usePathname } from 'next/navigation';
import { SETTINGS_ROUTES } from '@/app/routes';
import { MobileHeader } from '@/molecules/MobileHeader/MobileHeader';
import { SettingsInfo } from '@/molecules/Settings/SettingsInfo/SettingsInfo';
import { SettingsMenu } from '@/molecules/Settings/SettingsMenu/SettingsMenu';
import { SettingsMobileMenu } from '@/molecules/Settings/SettingsMobileMenu/SettingsMobileMenu';
import { ContentLayout } from '@/organisms/ContentLayout/ContentLayout';
import type { SettingsProps } from './Settings.types';

/**
 * Settings page layout component.
 * Handles the overall structure including mobile menu, sidebars, and content area.
 * Uses ContentLayout for responsive sidebar/drawer behavior.
 */
export function Settings({ children }: SettingsProps) {
  const pathname = usePathname();
  const isOnHelpPage = pathname === SETTINGS_ROUTES.HELP;

  return (
    <>
      {/* Mobile header - rendered here for control over hasGradientBackground */}
      <MobileHeader
        containerClassName="pb-0"
        hasGradientBackground={false}
        showLeftButton={false}
        showRightButton={false}
        fixed
      />

      {/* Mobile tab navigation - visible only on mobile (< lg) */}
      <SettingsMobileMenu />

      <ContentLayout
        renderMobileHeader={false}
        showLeftMobileButton={false}
        showRightMobileButton={false}
        leftSidebarContent={<SettingsMenu />}
        rightSidebarContent={<SettingsInfo hideFAQ={isOnHelpPage} />}
        leftDrawerContent={<SettingsMenu />}
        rightDrawerContent={<SettingsInfo hideFAQ={isOnHelpPage} />}
        className="pt-(--settings-mobile-chrome-height) lg:pt-0"
        disableWideShellLayout
      >
        {children}
      </ContentLayout>
    </>
  );
}
