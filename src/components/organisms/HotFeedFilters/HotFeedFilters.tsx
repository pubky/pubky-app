'use client';

import { useTranslations } from 'next-intl';
import { Calendar, CalendarRange, Clock, Star } from 'lucide-react';
import * as Atoms from '@/atoms';
import * as Molecules from '@/molecules';
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
    <Atoms.FilterRoot>
      <Atoms.FilterHeader title={t('title')} />
      <Atoms.FilterList>
        {timeframeTabs.map(({ key, label, icon: Icon }) => {
          const isSelected = selectedTab === key;
          return (
            <Atoms.FilterItem key={key} isSelected={isSelected} onClick={() => handleTabClick(key)}>
              <Atoms.FilterItemIcon icon={Icon} />
              <Atoms.FilterItemLabel>{label}</Atoms.FilterItemLabel>
            </Atoms.FilterItem>
          );
        })}
      </Atoms.FilterList>
    </Atoms.FilterRoot>
  );
}

// ============================================================================
// Sidebar & Drawer Components
// ============================================================================

/**
 * HotFeedSidebar
 *
 * Left sidebar for Hot feed - displays reach and timeframe filters.
 * Uses the hot store for state management.
 * Desktop version with sticky positioning.
 */
export function HotFeedSidebar() {
  const { reach, setReach, timeframe, setTimeframe } = useHotStore();
  return (
    <>
      <Molecules.FilterReach selectedTab={reach} onTabChange={setReach} />
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
  return (
    <div className="flex flex-col gap-6">
      <Molecules.FilterReach selectedTab={reach} onTabChange={setReach} />
      <FilterTimeframe selectedTab={timeframe} onTabChange={setTimeframe} />
    </div>
  );
}
