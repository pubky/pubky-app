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
 * Negative margin override (passed via className):
 * - `-mx-6` cancels the parent ContentLayout container's `px-6` padding
 *   so the menu stretches full-width edge-to-edge.
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
      headerTop="compact"
      className="-mx-6"
      data-testid="hot-mobile-menu"
    />
  );
}
