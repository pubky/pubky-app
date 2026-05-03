'use client';
import { FilterContent } from '@/molecules/Filters/FilterContent/FilterContent';
import { FilterLayout } from '@/molecules/Filters/FilterLayout/FilterLayout';
import { FilterReach } from '@/molecules/Filters/FilterReach/FilterReach';
import { FilterSort } from '@/molecules/Filters/FilterSort/FilterSort';

import { cn } from '@/libs/utils/utils';
import { useHomeStore } from '@/stores/home/home.store';
export interface LeftSidebarProps {
  className?: string;
}

export function LeftSidebar({ className }: LeftSidebarProps) {
  const { reach, setReach, sort, setSort, content, setContent, layout, setLayout } = useHomeStore();

  return (
    <div
      data-testid="left-sidebar"
      className={cn('hidden w-(--filter-bar-width) flex-col items-start justify-start gap-6 lg:flex', className)}
    >
      <FilterReach selectedTab={reach} onTabChange={setReach} />
      <FilterSort selectedTab={sort} onTabChange={setSort} />
      <div className="sticky top-[100px] flex flex-col gap-6 self-start">
        <FilterContent selectedTab={content} onTabChange={setContent} />
        <FilterLayout selectedTab={layout} onTabChange={setLayout} />
      </div>
    </div>
  );
}
