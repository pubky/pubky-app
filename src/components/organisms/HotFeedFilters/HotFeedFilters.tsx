'use client';

import { Calendar, CalendarRange, Clock, Star } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  FilterHeader,
  FilterItem,
  FilterItemIcon,
  FilterItemLabel,
  FilterList,
  FilterRoot,
} from '@/atoms/Filter/Filter';
import { useRequireAuth } from '@/hooks/useRequireAuth/useRequireAuth';
import { FilterReach } from '@/molecules/Filters/FilterReach/FilterReach';
import { useAuthStore } from '@/stores/auth/auth.store';
import { REACH, type ReachType } from '@/stores/home/home.types';
import { useHotStore } from '@/stores/hot/hot.store';
import { TIMEFRAME, type TimeframeType } from '@/stores/hot/hot.types';

// ============================================================================
// FilterTimeframe Component
// ============================================================================
interface FilterTimeframeProps {
  selectedTab?: TimeframeType;
  onTabChange?: (tab: TimeframeType) => void;
}

/**
 * FilterTimeframe
 *
 * Filter component for selecting timeframe (Today, This Week, This Month, All Time).
 */
export function FilterTimeframe({ selectedTab = TIMEFRAME.THIS_MONTH, onTabChange }: FilterTimeframeProps) {
  const t = useTranslations('filters.timeframe');
  const timeframeTabs: {
    key: TimeframeType;
    label: string;
    icon: React.ComponentType<{
      className?: string;
    }>;
  }[] = [
    {
      key: TIMEFRAME.TODAY,
      label: t('today'),
      icon: Star,
    },
    {
      key: TIMEFRAME.THIS_WEEK,
      label: t('thisWeek'),
      icon: CalendarRange,
    },
    {
      key: TIMEFRAME.THIS_MONTH,
      label: t('thisMonth'),
      icon: Calendar,
    },
    {
      key: TIMEFRAME.ALL_TIME,
      label: t('allTime'),
      icon: Clock,
    },
  ];
  const handleTabClick = (tab: TimeframeType) => {
    onTabChange?.(tab);
  };
  return (
    <FilterRoot>
      <FilterHeader title={t('title')} />
      <FilterList>
        {timeframeTabs.map(({ key, label, icon: Icon }) => {
          const isSelected = selectedTab === key;
          return (
            <FilterItem key={key} isSelected={isSelected} onClick={() => handleTabClick(key)}>
              <FilterItemIcon icon={Icon} />
              <FilterItemLabel>{label}</FilterItemLabel>
            </FilterItem>
          );
        })}
      </FilterList>
    </FilterRoot>
  );
}

// ============================================================================
// Sidebar & Drawer Components
// ============================================================================

/**
 * useGatedReachChange
 *
 * "All" reach is public; "Following"/"Friends" require an account, so prompt
 * Join Pubky in Explore mode (logged out) instead of changing the reach.
 */
function useGatedReachChange(setReach: (reach: ReachType) => void) {
  const { requireAuth } = useRequireAuth();
  return (value: ReachType) => {
    if (value === REACH.ALL) {
      setReach(value);
      return;
    }
    requireAuth(() => setReach(value));
  };
}

/**
 * HotFeedSidebar
 *
 * Left sidebar for Hot feed - displays reach and timeframe filters.
 * Uses the hot store for state management.
 * Desktop version with sticky positioning.
 */
export function HotFeedSidebar() {
  const { reach, setReach, timeframe, setTimeframe } = useHotStore();
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  const isAuthenticated = Boolean(currentUserPubky);
  const effectiveReach = isAuthenticated ? reach : REACH.ALL;

  const handleReachChange = useGatedReachChange(setReach);

  return (
    <>
      <FilterReach selectedTab={effectiveReach} onTabChange={handleReachChange} />
      <div className="sticky top-[100px] w-full self-start">
        <FilterTimeframe selectedTab={timeframe} onTabChange={setTimeframe} />
      </div>
    </>
  );
}

/**
 * HotFeedDrawer
 *
 * Left drawer for Hot feed (tablet/mobile) - displays reach and timeframe filters.
 * Uses the hot store for state management.
 */
export function HotFeedDrawer() {
  const { reach, setReach, timeframe, setTimeframe } = useHotStore();
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  const isAuthenticated = Boolean(currentUserPubky);
  const effectiveReach = isAuthenticated ? reach : REACH.ALL;

  const handleReachChange = useGatedReachChange(setReach);

  return (
    <div className="flex flex-col gap-6">
      <FilterReach selectedTab={effectiveReach} onTabChange={handleReachChange} />
      <FilterTimeframe selectedTab={timeframe} onTabChange={setTimeframe} />
    </div>
  );
}
