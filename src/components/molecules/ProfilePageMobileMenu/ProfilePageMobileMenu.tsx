'use client';

import { type ComponentType, forwardRef } from 'react';
import { Bell, CircleUserRound, HeartHandshake, MessageCircle, StickyNote, Tag, UsersRound } from 'lucide-react';
import { PROFILE_PAGE_TYPES, type ProfilePageType } from '@/app/profile/types';
import { useRequireAuth } from '@/hooks/useRequireAuth/useRequireAuth';
import { UsersRound2 } from '@/icons';
import { MobileTabBar } from '../MobileTabBar/MobileTabBar';
import type { MobileTabBarItem } from '../MobileTabBar/MobileTabBar.types';

export interface ProfileMenuItem {
  icon: ComponentType<{ size?: number; className?: string }>;
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
    icon: StickyNote,
    label: 'Posts',
    pageType: PROFILE_PAGE_TYPES.POSTS,
  },
  {
    icon: MessageCircle,
    label: 'Replies',
    pageType: PROFILE_PAGE_TYPES.REPLIES,
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
 *
 * Forwards a ref to the underlying `MobileTabBar` root so a parent layout can
 * measure the sticky menu (e.g. to align scroll targets below it).
 */
export const ProfilePageMobileMenu = forwardRef<HTMLDivElement, ProfilePageMobileMenuProps>(
  function ProfilePageMobileMenu({ activePage, onPageChangeAction, isOwnProfile = true }, ref) {
    const { requireAuth } = useRequireAuth();

    const visibleItems = PROFILE_MENU_ITEMS.filter((item) => !item.ownProfileOnly || isOwnProfile);

    const items: MobileTabBarItem[] = visibleItems.map((item) => ({
      key: item.pageType,
      icon: item.icon,
      label: item.label,
      isActive: item.pageType === activePage,
      onSelect: () => requireAuth(() => onPageChangeAction(item.pageType)),
    }));

    return (
      <MobileTabBar
        ref={ref}
        items={items}
        position="sticky"
        headerTop="compact"
        data-testid="profile-page-mobile-menu"
      />
    );
  },
);
