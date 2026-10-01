'use client';

import * as React from 'react';
import { Bell, HeartHandshake, Library, LockOpen, MessageCircle, StickyNote, Tag, UsersRound } from 'lucide-react';
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
  /** Stable identifier used for data-cy hooks. */
  id: string;
  label: string;
  count: number | undefined;
  pageType: FilterBarPageType;
  /** When false, the tab renders without a count badge: no stat to show, or the read for it failed. */
  showCount?: boolean;
  /** Whether this item should only be shown for own profile */
  ownProfileOnly?: boolean;
}
export interface ProfilePageFilterBarProps {
  items?: ProfilePageFilterBarItem[];
  stats?: ProfileStats;
  /**
   * Unlocked-content count; separate from `stats` because Nexus cannot index the reader's `/priv`.
   * `undefined` while the read is in flight (spinner), `null` when it failed (label only).
   */
  unlockedCount?: number | null;
  activePage: FilterBarPageType;
  onPageChangeAction: (page: FilterBarPageType) => void;
  /** Whether this is the logged-in user's own profile */
  isOwnProfile?: boolean;
}

// Item configuration - single source of truth for filter items
const FILTER_ITEMS_CONFIG: Array<{
  icon: React.ComponentType<{
    className?: string;
  }>;
  /** Stable identifier used for data-cy hooks. */
  id: string;
  label: string;
  pageType: FilterBarPageType;
  statKey?: keyof ProfileStats;
  /** Whether this item should only be shown for own profile */
  ownProfileOnly?: boolean;
}> = [
  {
    icon: Bell,
    id: 'notifications',
    label: 'Notifications',
    pageType: PROFILE_PAGE_TYPES.NOTIFICATIONS,
    statKey: 'notifications',
    ownProfileOnly: true, // Notifications only make sense for logged-in user
  },
  {
    icon: StickyNote,
    id: 'posts',
    label: 'Posts',
    pageType: PROFILE_PAGE_TYPES.POSTS,
    statKey: 'posts',
  },
  {
    icon: MessageCircle,
    id: 'replies',
    label: 'Replies',
    pageType: PROFILE_PAGE_TYPES.REPLIES,
    statKey: 'replies',
  },
  {
    icon: UsersRound,
    id: 'followers',
    label: 'Followers',
    pageType: PROFILE_PAGE_TYPES.FOLLOWERS,
    statKey: 'followers',
  },
  {
    icon: UsersRound2,
    id: 'following',
    label: 'Following',
    pageType: PROFILE_PAGE_TYPES.FOLLOWING,
    statKey: 'following',
  },
  {
    icon: HeartHandshake,
    id: 'friends',
    label: 'Friends',
    pageType: PROFILE_PAGE_TYPES.FRIENDS,
    statKey: 'friends',
  },
  {
    icon: Tag,
    id: 'tagged',
    label: 'Tagged',
    pageType: PROFILE_PAGE_TYPES.UNIQUE_TAGS,
    statKey: 'uniqueTags',
  },
  {
    icon: Library,
    id: 'collections',
    label: 'Collections',
    pageType: PROFILE_PAGE_TYPES.COLLECTIONS,
    statKey: 'collections',
  },
  {
    icon: LockOpen,
    id: 'unlocked',
    label: 'Unlocked',
    pageType: PROFILE_PAGE_TYPES.UNLOCKED,
    // No statKey: the count comes from `unlockedCount`, not Nexus stats.
    ownProfileOnly: true,
  },
];
export interface GetDefaultItemsParams {
  stats?: ProfileStats;
  isOwnProfile?: boolean;
  /** Count for the Unlocked tab: `undefined` while the read is in flight (spinner), `null` when it failed (label only). */
  unlockedCount?: number | null;
}

export const getDefaultItems = ({
  stats,
  isOwnProfile = true,
  unlockedCount,
}: GetDefaultItemsParams = {}): ProfilePageFilterBarItem[] => {
  return FILTER_ITEMS_CONFIG.filter((config) => {
    // Filter out own-profile-only items when viewing another user's profile
    if (config.ownProfileOnly && !isOwnProfile) {
      return false;
    }
    return true;
  }).map((config) => {
    // Unlocked has no statKey — its count is passed in, since Nexus can't index the reader's /priv.
    const isUnlocked = config.pageType === PROFILE_PAGE_TYPES.UNLOCKED;
    // Undefined count = still loading, which renders a spinner instead of a number.
    const statCount = config.statKey && stats ? (stats[config.statKey] ?? 0) : undefined;

    return {
      icon: config.icon,
      id: config.id,
      label: config.label,
      pageType: config.pageType,
      showCount: isUnlocked ? unlockedCount !== null : config.statKey !== undefined,
      count: isUnlocked ? (unlockedCount ?? undefined) : statCount,
      ownProfileOnly: config.ownProfileOnly,
    };
  });
};
export function ProfilePageFilterBar({
  items,
  stats,
  unlockedCount,
  activePage,
  onPageChangeAction,
  isOwnProfile = true,
}: ProfilePageFilterBarProps) {
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
    return getDefaultItems({ stats, isOwnProfile, unlockedCount });
  }, [items, stats, isOwnProfile, unlockedCount]);

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
          return (
            <FilterItem
              key={index}
              isSelected={isActive}
              onClick={() => handleItemClick(item.pageType)}
              className="w-full items-start justify-between px-0 py-1"
            >
              <Container
                data-cy={`profile-filter-item-${item.id}`}
                overrideDefaults={true}
                className="flex items-center gap-2"
              >
                <FilterItemIcon icon={Icon} />
                <FilterItemLabel>{item.label}</FilterItemLabel>
              </Container>
              {showCount &&
                (isLoading ? (
                  <Spinner size="sm" className="size-4" />
                ) : (
                  <Typography
                    data-cy={`profile-filter-item-${item.id}-count`}
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
