'use client';

import * as React from 'react';
import { Bell, CircleUserRound, HeartHandshake, MessageCircle, StickyNote, Tag, UsersRound } from 'lucide-react';
import { PROFILE_PAGE_TYPES, type ProfilePageType } from '@/app/profile/types';
import { useRequireAuth } from '@/hooks/useRequireAuth/useRequireAuth';
import { UsersRound2 } from '@/icons';
import { MobileTabBar } from '../MobileTabBar/MobileTabBar';
import type { MobileTabBarItem } from '../MobileTabBar/MobileTabBar.types';

export interface ProfileMenuItem {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  pageType: ProfilePageType;
  /** Whether this item should only be shown for own profile */
  ownProfileOnly?: boolean;
}
export const PROFILE_MENU_ITEMS: ProfileMenuItem[] = [
  {
    icon: CircleUserRound,
    label: 'Profile',
    pageType: PROFILE_PAGE_TYPES.PROFILE,
  },
  {
    icon: Bell,
    label: 'Notifications',
    pageType: PROFILE_PAGE_TYPES.NOTIFICATIONS,
    ownProfileOnly: true, // Notifications only make sense for logged-in user
  },
  {
    icon: MessageCircle,
    label: 'Replies',
    pageType: PROFILE_PAGE_TYPES.REPLIES,
  },
  {
    icon: StickyNote,
    label: 'Posts',
    pageType: PROFILE_PAGE_TYPES.POSTS,
  },
  {
    icon: UsersRound,
    label: 'Followers',
    pageType: PROFILE_PAGE_TYPES.FOLLOWERS,
  },
  {
    icon: UsersRound2,
    label: 'Following',
    pageType: PROFILE_PAGE_TYPES.FOLLOWING,
  },
  {
    icon: HeartHandshake,
    label: 'Friends',
    pageType: PROFILE_PAGE_TYPES.FRIENDS,
  },
  {
    icon: Tag,
    label: 'Tagged',
    pageType: PROFILE_PAGE_TYPES.UNIQUE_TAGS,
  },
];
export interface ProfilePageMobileMenuProps {
  activePage: ProfilePageType;
  onPageChangeAction: (page: ProfilePageType) => void;
  /** Whether this is the logged-in user's own profile */
  isOwnProfile?: boolean;
}

/**
 * Mobile navigation menu for profile pages.
 * Delegates rendering to the shared `MobileTabBar` molecule.
 *
 * Owns profile-specific semantics:
 * - Filters items via `isOwnProfile` (e.g. hides Notifications on other users).
 * - Wraps click handlers with `requireAuth` for unauthenticated users.
 * - Uses raw English labels (no i18n sweep yet).
 */
export function ProfilePageMobileMenu({
  activePage,
  onPageChangeAction,
  isOwnProfile = true,
}: ProfilePageMobileMenuProps) {
  const { requireAuth } = useRequireAuth();

  // Filter menu items based on isOwnProfile
  const visibleItems = React.useMemo(() => {
    return PROFILE_MENU_ITEMS.filter((item) => {
      if (item.ownProfileOnly && !isOwnProfile) {
        return false;
      }
      return true;
    });
  }, [isOwnProfile]);

  const items: MobileTabBarItem[] = visibleItems.map((item) => ({
    key: item.pageType,
    icon: item.icon,
    label: item.label,
    isActive: item.pageType === activePage,
    onSelect: () => requireAuth(() => onPageChangeAction(item.pageType)),
  }));

  return <MobileTabBar items={items} position="sticky" data-testid="profile-page-mobile-menu" />;
}
