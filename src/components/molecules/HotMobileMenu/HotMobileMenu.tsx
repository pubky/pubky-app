'use client';

import { StickyNote, Tag, UsersRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { MobileTabBar } from '../MobileTabBar/MobileTabBar';
import type { MobileTabBarItem } from '../MobileTabBar/MobileTabBar.types';
import { type HotMobileMenuItem, type HotMobileMenuProps, HotSection } from './HotMobileMenu.types';

export const HOT_MOBILE_MENU_ITEMS: HotMobileMenuItem[] = [
  { icon: Tag, section: HotSection.TAGS },
  { icon: UsersRound, section: HotSection.USERS },
  { icon: StickyNote, section: HotSection.POSTS },
];

/**
 * Mobile navigation menu for the Hot page.
 * Shows 3 tabs with icon + text: Tags, Users, Posts.
 * Only visible on mobile (< lg breakpoint).
 * Delegates rendering to the shared `MobileTabBar` molecule.
 *
 * Negative margin overrides (passed via className):
 * - `-mx-6` cancels the parent ContentLayout container's `px-6` padding
 *   so the menu stretches full-width edge-to-edge.
 * - `-mt-6` cancels the parent flex container's `gap-6` above so the menu sits
 *   flush against the header, preventing a layout shift when sticky activates.
 */
export function HotMobileMenu({ activeSection, onSectionChange }: HotMobileMenuProps) {
  const t = useTranslations('hot');

  const items: MobileTabBarItem[] = HOT_MOBILE_MENU_ITEMS.map((item) => ({
    key: item.section,
    icon: item.icon,
    label: t(item.section),
    isActive: item.section === activeSection,
    onSelect: () => onSectionChange(item.section),
  }));

  return (
    <MobileTabBar
      items={items}
      showLabels
      position="sticky"
      className="-mx-6 -mt-6 mb-6"
      data-testid="hot-mobile-menu"
    />
  );
}
