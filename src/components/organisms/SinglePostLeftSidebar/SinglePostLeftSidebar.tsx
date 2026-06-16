'use client';
import { Container } from '@/atoms/Container/Container';
import { FilterContent } from '@/molecules/Filters/FilterContent/FilterContent';
import { FilterLayout } from '@/molecules/Filters/FilterLayout/FilterLayout';
import { FilterReach } from '@/molecules/Filters/FilterReach/FilterReach';
import { FilterSort } from '@/molecules/Filters/FilterSort/FilterSort';
import { useHomeStore } from '@/stores/home/home.store';

/**
 * SinglePostFilters
 *
 * Filter set for SinglePost page left panels.
 * Currently supports layout in desktop sidebar and wide-shell drawer contexts.
 */
function SinglePostFilters({ hideLayoutFilter = false }: { hideLayoutFilter?: boolean }) {
  const { layout, setLayout } = useHomeStore();

  return (
    <Container overrideDefaults className="flex flex-col gap-6">
      <FilterReach selectedTab={undefined} defaultSelectedTab={undefined} disabled />
      <FilterSort selectedTab={undefined} defaultSelectedTab={undefined} disabled />
      {!hideLayoutFilter && <FilterLayout selectedTab={layout} onTabChange={setLayout} />}
      <FilterContent selectedTab={undefined} defaultSelectedTab={undefined} disabled />
    </Container>
  );
}

/**
 * SinglePostLeftSidebar
 *
 * Left sidebar for SinglePost page (desktop).
 */
export function SinglePostLeftSidebar() {
  return <SinglePostFilters />;
}

/**
 * SinglePostLeftDrawer
 *
 * Left drawer for SinglePost page outside mobile drawer contexts.
 */
export function SinglePostLeftDrawer() {
  return <SinglePostFilters />;
}

/**
 * SinglePostLeftDrawerMobile
 *
 * Left drawer for SinglePost page on mobile viewports.
 */
export function SinglePostLeftDrawerMobile() {
  return <SinglePostFilters hideLayoutFilter />;
}
