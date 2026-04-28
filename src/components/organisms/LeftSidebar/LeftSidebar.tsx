'use client';

import * as Molecules from '@/molecules';
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
      <Molecules.FilterReach selectedTab={reach} onTabChange={setReach} />
      <Molecules.FilterSort selectedTab={sort} onTabChange={setSort} />
      <div className="sticky top-[100px] flex flex-col gap-6 self-start">
        <Molecules.FilterContent selectedTab={content} onTabChange={setContent} />
        <Molecules.FilterLayout selectedTab={layout} onTabChange={setLayout} />
      </div>
    </div>
  );
}
