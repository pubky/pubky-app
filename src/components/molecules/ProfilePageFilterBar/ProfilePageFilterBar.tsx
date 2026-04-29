'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import * as Atoms from '@/components/atoms';
import * as Hooks from '@/hooks';
import * as Types from '@/app/profile/types';
import * as Config from '@/config';
import { Bell, StickyNote, MessageCircle, UsersRound, HeartHandshake, Tag } from 'lucide-react';
import { UsersRound2 } from '@/icons';
import { cn } from '@/libs/utils/utils';
export interface ProfilePageFilterBarItem {
  icon: React.ComponentType<{
    className?: string;
  }>;
  labelKey: string;
  count: number | undefined;
  pageType: Types.FilterBarPageType;
  /** Whether this item should only be shown for own profile */
  ownProfileOnly?: boolean;
}
export interface ProfilePageFilterBarProps {
  items?: ProfilePageFilterBarItem[];
  stats?: Hooks.ProfileStats;
  activePage: Types.FilterBarPageType;
  onPageChangeAction: (page: Types.FilterBarPageType) => void;
  /** Whether this is the logged-in user's own profile */
  isOwnProfile?: boolean;
}

// Item configuration - single source of truth for filter items
// Uses labelKey for i18n translation lookup in 'profile.tabs' namespace
const FILTER_ITEMS_CONFIG: Array<{
  icon: React.ComponentType<{
    className?: string;
  }>;
  labelKey: string;
  pageType: Types.FilterBarPageType;
  statKey: keyof Hooks.ProfileStats;
  /** Whether this item should only be shown for own profile */
  ownProfileOnly?: boolean;
}> = [
  {
    icon: Bell,
    labelKey: 'notifications',
    pageType: Types.PROFILE_PAGE_TYPES.NOTIFICATIONS,
    statKey: 'notifications',
    ownProfileOnly: true, // Notifications only make sense for logged-in user
  },
  {
    icon: StickyNote,
    labelKey: 'posts',
    pageType: Types.PROFILE_PAGE_TYPES.POSTS,
    statKey: 'posts',
  },
  {
    icon: MessageCircle,
    labelKey: 'replies',
    pageType: Types.PROFILE_PAGE_TYPES.REPLIES,
    statKey: 'replies',
  },
  {
    icon: UsersRound,
    labelKey: 'followers',
    pageType: Types.PROFILE_PAGE_TYPES.FOLLOWERS,
    statKey: 'followers',
  },
  {
    icon: UsersRound2,
    labelKey: 'following',
    pageType: Types.PROFILE_PAGE_TYPES.FOLLOWING,
    statKey: 'following',
  },
  {
    icon: HeartHandshake,
    labelKey: 'friends',
    pageType: Types.PROFILE_PAGE_TYPES.FRIENDS,
    statKey: 'friends',
  },
  {
    icon: Tag,
    labelKey: 'tagged',
    pageType: Types.PROFILE_PAGE_TYPES.UNIQUE_TAGS,
    statKey: 'uniqueTags',
  },
];
export const getDefaultItems = (
  stats?: Hooks.ProfileStats,
  isOwnProfile: boolean = true,
): ProfilePageFilterBarItem[] => {
  return FILTER_ITEMS_CONFIG.filter((config) => {
    // Filter out own-profile-only items when viewing another user's profile
    if (config.ownProfileOnly && !isOwnProfile) {
      return false;
    }
    return true;
  }).map((config) => ({
    icon: config.icon,
    labelKey: config.labelKey,
    pageType: config.pageType,
    // If stats not provided, count is undefined (loading state)
    // If stats provided, use the value or fallback to 0
    count: stats ? (stats[config.statKey] ?? 0) : undefined,
    ownProfileOnly: config.ownProfileOnly,
  }));
};
export function ProfilePageFilterBar({
  items,
  stats,
  activePage,
  onPageChangeAction,
  isOwnProfile = true,
}: ProfilePageFilterBarProps) {
  const t = useTranslations('profile.tabs');
  const { requireAuth } = Hooks.useRequireAuth();

  // Use provided items or generate default items with stats
  const filterItems = React.useMemo(() => {
    if (items) {
      // Filter provided items based on isOwnProfile
      return items.filter((item) => {
        if (item.ownProfileOnly && !isOwnProfile) {
          return false;
        }
        return true;
      });
    }
    return getDefaultItems(stats, isOwnProfile);
  }, [items, stats, isOwnProfile]);

  // Only apply sticky when content fits in viewport
  const { ref, shouldBeSticky } = Hooks.useStickyWhenFits({
    topOffset: Config.LAYOUT_DIMENSIONS.HEADER_HEIGHT_PROFILE,
    bottomOffset: Config.LAYOUT_DIMENSIONS.SIDEBAR_BOTTOM_OFFSET,
  });

  // Handle item click - require auth for unauthenticated users
  const handleItemClick = (pageType: Types.FilterBarPageType) => {
    requireAuth(() => onPageChangeAction(pageType));
  };
  return (
    <Atoms.Container
      ref={ref}
      overrideDefaults={true}
      className={cn(
        'hidden h-fit w-(--filter-bar-width) flex-col self-start lg:flex',
        // Use !== false to treat undefined (SSR) as sticky (optimistic assumption)
        shouldBeSticky !== false && 'sticky top-(--header-height)',
      )}
    >
      <Atoms.Container overrideDefaults={true} className="flex flex-col gap-0">
        {filterItems.map((item, index) => {
          const Icon = item.icon;
          const isActive = item.pageType === activePage;
          const isLoading = item.count === undefined;
          const label = t(item.labelKey);
          return (
            <Atoms.FilterItem
              key={index}
              isSelected={isActive}
              onClick={() => handleItemClick(item.pageType)}
              className="w-full items-start justify-between px-0 py-1"
            >
              <Atoms.Container
                data-cy={`profile-filter-item-${item.labelKey}`}
                overrideDefaults={true}
                className="flex items-center gap-2"
              >
                <Atoms.FilterItemIcon icon={Icon} />
                <Atoms.FilterItemLabel>{label}</Atoms.FilterItemLabel>
              </Atoms.Container>
              {isLoading ? (
                <Atoms.Spinner size="sm" className="size-4" />
              ) : (
                <Atoms.Typography
                  data-cy={`profile-filter-item-${item.labelKey}-count`}
                  as="span"
                  className={`text-base font-medium ${isActive ? 'text-foreground' : 'text-muted-foreground'}`}
                >
                  {item.count}
                </Atoms.Typography>
              )}
            </Atoms.FilterItem>
          );
        })}
      </Atoms.Container>
    </Atoms.Container>
  );
}
