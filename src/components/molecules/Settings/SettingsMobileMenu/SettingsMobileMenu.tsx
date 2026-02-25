'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as Libs from '@/libs';
import * as Atoms from '@/atoms';
import { SETTINGS_MOBILE_ITEMS } from './SettingsMobileMenu.constants';

/**
 * Mobile settings navigation menu.
 * Follows same pattern as ProfilePageMobileMenu.
 * Uses --header-height-mobile CSS var for consistent positioning.
 * Only visible on mobile (< lg breakpoint).
 */
export function SettingsMobileMenu() {
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations('settings.menu');

  return (
    <Atoms.Container
      overrideDefaults
      data-testid="settings-mobile-menu"
      className="mobile-menu-gradient-fade fixed top-(--header-height-mobile) right-0 left-0 z-(--z-sticky-header) bg-background lg:hidden"
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
