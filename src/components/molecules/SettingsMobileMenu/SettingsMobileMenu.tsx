'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as Libs from '@/libs';
import { SETTINGS_ROUTES } from '@/app';
import * as Atoms from '@/atoms';

const SETTINGS_MOBILE_ITEMS = [
  { icon: Libs.UserRound, labelKey: 'account', path: SETTINGS_ROUTES.ACCOUNT },
  { icon: Libs.Bell, labelKey: 'notifications', path: SETTINGS_ROUTES.NOTIFICATIONS },
  { icon: Libs.Shield, labelKey: 'privacySafety', path: SETTINGS_ROUTES.PRIVACY_SAFETY },
  { icon: Libs.MegaphoneOff, labelKey: 'mutedUsers', path: SETTINGS_ROUTES.MUTED_USERS },
  { icon: Libs.Globe, labelKey: 'language', path: SETTINGS_ROUTES.LANGUAGE },
  { icon: Libs.CircleHelp, labelKey: 'help', path: SETTINGS_ROUTES.HELP },
];

export interface SettingsMobileMenuProps {
  className?: string;
}

/**
 * Mobile settings navigation menu.
 * Follows same pattern as ProfilePageMobileMenu.
 * Uses --header-height-mobile CSS var for consistent positioning.
 */
export function SettingsMobileMenu({ className }: SettingsMobileMenuProps) {
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations('settings.menu');

  return (
    <Atoms.Container
      overrideDefaults
      data-testid="settings-mobile-menu"
      className={Libs.cn(
        'mobile-menu-gradient-fade fixed top-(--header-height-mobile) right-0 left-0 z-(--z-sticky-header) bg-background',
        className,
      )}
    >
      <Atoms.Container overrideDefaults className="flex w-full">
        {SETTINGS_MOBILE_ITEMS.map((item) => {
          const Icon = item.icon;
          const isSelected = pathname === item.path;

          return (
            <Atoms.Container
              key={item.path}
              overrideDefaults
              className={Libs.cn(
                'flex flex-1 justify-center border-b px-0 py-1.5',
                isSelected ? 'border-foreground' : 'border-border',
              )}
            >
              <Atoms.Button
                overrideDefaults
                onClick={() => router.push(item.path)}
                className="px-2.5 py-2"
                aria-label={t(item.labelKey)}
                aria-current={isSelected ? 'page' : undefined}
              >
                <Icon size={20} className={isSelected ? 'text-foreground' : 'text-muted-foreground'} />
              </Atoms.Button>
            </Atoms.Container>
          );
        })}
      </Atoms.Container>
    </Atoms.Container>
  );
}
