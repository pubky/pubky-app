'use client';

import * as React from 'react';
import { Bell, HeartHandshake, Library, MessageCircle, StickyNote, Tag, UsersRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type FilterBarPageType, PROFILE_PAGE_TYPES } from '@/app/profile/types';
import { Container } from '@/atoms/Container/Container';
import { FilterItem, FilterItemIcon, FilterItemLabel } from '@/atoms/Filter/Filter';
import { Spinner } from '@/atoms/Spinner/Spinner';
import { Typography } from '@/atoms/Typography/Typography';
import { LAYOUT_DIMENSIONS } from '@/config/layoutDimensions';
import type { ProfileStats } from '@/hooks/useProfileStats/useProfileStats.types';
import { useRequireAuth } from '@/hooks/useRequireAuth/useRequireAuth';
import { useStickyWhenFits } from '@/hooks/useStickyWhenFits/useStickyWhenFits';
import { UsersRound2 } from '@/icons';
import { cn } from '@/libs/utils/utils';

export interface ProfilePageFilterBarItem {
  icon: React.ComponentType<{
    className?: string;
  }>;
  labelKey: string;
  count: number | undefined;
  pageType: FilterBarPageType;
  /** When false, the tab renders without a count badge (set for tabs that have no stat). */
  showCount?: boolean;
  /** Whether this item should only be shown for own profile */
  ownProfileOnly?: boolean;
}
export interface ProfilePageFilterBarProps {
  items?: ProfilePageFilterBarItem[];
  stats?: ProfileStats;
  activePage: FilterBarPageType;
  onPageChangeAction: (page: FilterBarPageType) => void;
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
  pageType: FilterBarPageType;
  statKey?: keyof ProfileStats;
  /** Whether this item should only be shown for own profile */
  ownProfileOnly?: boolean;
}> = [
  {
    icon: Bell,
    labelKey: 'notifications',
    pageType: PROFILE_PAGE_TYPES.NOTIFICATIONS,
    statKey: 'notifications',
    ownProfileOnly: true, // Notifications only make sense for logged-in user
  },
  {
    icon: StickyNote,
    labelKey: 'posts',
    pageType: PROFILE_PAGE_TYPES.POSTS,
    statKey: 'posts',
  },
  {
    icon: MessageCircle,
    labelKey: 'replies',
    pageType: PROFILE_PAGE_TYPES.REPLIES,
    statKey: 'replies',
  },
  {
    icon: UsersRound,
    labelKey: 'followers',
    pageType: PROFILE_PAGE_TYPES.FOLLOWERS,
    statKey: 'followers',
  },
  {
    icon: UsersRound2,
    labelKey: 'following',
    pageType: PROFILE_PAGE_TYPES.FOLLOWING,
    statKey: 'following',
  },
  {
    icon: HeartHandshake,
    labelKey: 'friends',
    pageType: PROFILE_PAGE_TYPES.FRIENDS,
    statKey: 'friends',
  },
  {
    icon: Tag,
    labelKey: 'tagged',
    pageType: PROFILE_PAGE_TYPES.UNIQUE_TAGS,
    statKey: 'uniqueTags',
  },
  {
    icon: Library,
    labelKey: 'collections',
    pageType: PROFILE_PAGE_TYPES.COLLECTIONS,
    statKey: 'collections',
  },
];
export const getDefaultItems = (stats?: ProfileStats, isOwnProfile: boolean = true): ProfilePageFilterBarItem[] => {
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
    showCount: config.statKey !== undefined,
    // If stats not provided, count is undefined (loading state)
    // If stats provided, use the value or fallback to 0
    count: config.statKey ? (stats ? (stats[config.statKey] ?? 0) : undefined) : undefined,
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
  const { requireAuth } = useRequireAuth();

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
  const { ref, shouldBeSticky } = useStickyWhenFits({
    topOffset: LAYOUT_DIMENSIONS.HEADER_HEIGHT_PROFILE,
    bottomOffset: LAYOUT_DIMENSIONS.SIDEBAR_BOTTOM_OFFSET,
  });

  // Handle item click - require auth for unauthenticated users
  const handleItemClick = (pageType: FilterBarPageType) => {
    requireAuth(() => onPageChangeAction(pageType));
  };
  return (
    <Container
      ref={ref}
      overrideDefaults={true}
      className={cn(
        'hidden h-fit w-(--filter-bar-width) flex-col self-start lg:flex',
        // Use !== false to treat undefined (SSR) as sticky (optimistic assumption)
        shouldBeSticky !== false && 'sticky top-(--header-height)',
      )}
    >
      <Container overrideDefaults={true} className="flex flex-col gap-0">
        {filterItems.map((item, index) => {
          const Icon = item.icon;
          const isActive = item.pageType === activePage;
          const showCount = item.showCount !== false;
          const isLoading = showCount && item.count === undefined;
          const label = t(item.labelKey);
          return (
            <FilterItem
              key={index}
              isSelected={isActive}
              onClick={() => handleItemClick(item.pageType)}
              className="w-full items-start justify-between px-0 py-1"
            >
              <Container
                data-cy={`profile-filter-item-${item.labelKey}`}
                overrideDefaults={true}
                className="flex items-center gap-2"
              >
                <FilterItemIcon icon={Icon} />
                <FilterItemLabel>{label}</FilterItemLabel>
              </Container>
              {showCount &&
                (isLoading ? (
                  <Spinner size="sm" className="size-4" />
                ) : (
                  <Typography
                    data-cy={`profile-filter-item-${item.labelKey}-count`}
                    as="span"
                    className={`text-base font-medium ${isActive ? 'text-foreground' : 'text-muted-foreground'}`}
                  >
                    {item.count}
                  </Typography>
                ))}
            </FilterItem>
          );
        })}
      </Container>
    </Container>
  );
}
