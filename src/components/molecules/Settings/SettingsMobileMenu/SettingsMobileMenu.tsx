'use client';

import { usePathname, useRouter } from 'next/navigation';
import { MobileTabBar } from '../../MobileTabBar/MobileTabBar';
import type { MobileTabBarItem } from '../../MobileTabBar/MobileTabBar.types';
import { SETTINGS_MOBILE_ITEMS } from './SettingsMobileMenu.constants';

/**
 * Mobile settings navigation menu.
 * Delegates rendering to the shared `MobileTabBar` molecule.
 *
 * Owns settings-specific semantics:
 * - Selection derived from `usePathname`.
 * - Click handler uses `router.push` to navigate between settings subpages.
 * - Labels come from `SETTINGS_MOBILE_ITEMS`.
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

  const items: MobileTabBarItem[] = SETTINGS_MOBILE_ITEMS.map((item) => ({
    key: item.path,
    icon: item.icon,
    label: item.label,
    isActive: pathname === item.path,
    onSelect: () => router.push(item.path),
  }));

  return <MobileTabBar items={items} position="fixed" headerTop="compact" data-testid="settings-mobile-menu" />;
}
