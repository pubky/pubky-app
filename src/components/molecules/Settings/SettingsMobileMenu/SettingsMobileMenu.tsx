'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { MobileTabBar, type MobileTabBarItem } from '../../MobileTabBar';
import { SETTINGS_MOBILE_ITEMS } from './SettingsMobileMenu.constants';

/**
 * Mobile settings navigation menu.
 * Delegates rendering to the shared `MobileTabBar` molecule.
 *
 * Owns settings-specific semantics:
 * - Selection derived from `usePathname`.
 * - Click handler uses `router.push` to navigate between settings subpages.
 * - Labels come from the `settings.menu.*` i18n namespace.
 * - Uses `position='fixed'` so the bar sits outside the settings layout's
 *   flow (existing behavior preserved).
 *
 * Z-index is `--z-mobile-menu` (via `MobileTabBar`'s default), consolidating
 * all three mobile tab bars onto the same variable. Previously used
 * `--z-sticky-header` — see unify-mobile-tab-bar plan for rationale.
 */
export function SettingsMobileMenu() {
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations('settings.menu');

  const items: MobileTabBarItem[] = SETTINGS_MOBILE_ITEMS.map((item) => ({
    key: item.path,
    icon: item.icon,
    label: t(item.labelKey),
    isActive: pathname === item.path,
    onSelect: () => router.push(item.path),
  }));

  return <MobileTabBar items={items} position="fixed" data-testid="settings-mobile-menu" />;
}
