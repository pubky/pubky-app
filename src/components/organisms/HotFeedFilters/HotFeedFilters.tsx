'use client';

import { useTranslations } from 'next-intl';
import { Calendar, CalendarRange, Clock, Star } from 'lucide-react';
import * as Atoms from '@/atoms';
import * as Molecules from '@/molecules';
import * as Core from '@/core';

// ============================================================================
// FilterTimeframe Component
// ============================================================================
interface FilterTimeframeProps {
  selectedTab?: Core.TimeframeType;
  onTabChange?: (tab: Core.TimeframeType) => void;
}

/**
 * FilterTimeframe
 *
 * Filter component for selecting timeframe (Today, This Week, This Month, All Time).
 */
export function FilterTimeframe({ selectedTab = Core.TIMEFRAME.THIS_MONTH, onTabChange }: FilterTimeframeProps) {
  const t = useTranslations('filters.timeframe');
  const timeframeTabs: {
    key: Core.TimeframeType;
    label: string;
    icon: React.ComponentType<{
      className?: string;
    }>;
  }[] = [
    {
      key: Core.TIMEFRAME.TODAY,
      label: t('today'),
      icon: Star,
    },
    {
      key: Core.TIMEFRAME.THIS_WEEK,
      label: t('thisWeek'),
      icon: CalendarRange,
    },
    {
      key: Core.TIMEFRAME.THIS_MONTH,
      label: t('thisMonth'),
      icon: Calendar,
    },
    {
      key: Core.TIMEFRAME.ALL_TIME,
      label: t('allTime'),
      icon: Clock,
    },
  ];
  const handleTabClick = (tab: Core.TimeframeType) => {
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
  const { reach, setReach, timeframe, setTimeframe } = Core.useHotStore();
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
  const { reach, setReach, timeframe, setTimeframe } = Core.useHotStore();
  return (
    <div className="flex flex-col gap-6">
      <Molecules.FilterReach selectedTab={reach} onTabChange={setReach} />
      <FilterTimeframe selectedTab={timeframe} onTabChange={setTimeframe} />
    </div>
  );
}
