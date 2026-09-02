'use client';

import { StickyNote, Tag, UsersRound } from 'lucide-react';
import { FULL_BLEED_GUTTER_CLASS } from '@/config/layoutClasses';
import { MobileTabBar } from '../MobileTabBar/MobileTabBar';
import type { MobileTabBarItem } from '../MobileTabBar/MobileTabBar.types';
import { type HotMobileMenuItem, type HotMobileMenuProps, HotSection } from './HotMobileMenu.types';

export const HOT_MOBILE_MENU_ITEMS: HotMobileMenuItem[] = [
  { icon: Tag, section: HotSection.TAGS, label: 'Tags' },
  { icon: UsersRound, section: HotSection.USERS, label: 'Users' },
  { icon: StickyNote, section: HotSection.POSTS, label: 'Posts' },
];

/**
 * Mobile navigation menu for the Hot page.
 * Shows 3 tabs with icon + text: Tags, Users, Posts.
 * Only visible on mobile (< lg breakpoint).
 * Delegates rendering to the shared `MobileTabBar` molecule.
 *
 * Full-bleed override (passed via className):
 * - `FULL_BLEED_GUTTER_CLASS` cancels the parent ContentLayout container's
 *   mobile gutter so the menu stretches full-width edge-to-edge.
 */
export function HotMobileMenu({ activeSection, onSectionChange }: HotMobileMenuProps) {
  const items: MobileTabBarItem[] = HOT_MOBILE_MENU_ITEMS.map((item) => ({
    key: item.section,
    icon: item.icon,
    label: item.label,
    isActive: item.section === activeSection,
    onSelect: () => onSectionChange(item.section),
  }));

  return (
    <MobileTabBar
      items={items}
      showLabels
      position="sticky"
      headerTop="compact"
      className={FULL_BLEED_GUTTER_CLASS}
      data-testid="hot-mobile-menu"
    />
  );
}
