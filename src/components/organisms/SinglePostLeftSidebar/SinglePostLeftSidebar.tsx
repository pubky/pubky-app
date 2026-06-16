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
 * Base filter set for SinglePost page left panels (reach, sort, content).
 * Layout-aware variants render the layout filter via a separate child so this
 * shared shell stays free of any store subscription.
 */
function SinglePostFilters({ children }: { children?: React.ReactNode }) {
  return (
    <Container overrideDefaults className="flex flex-col gap-6">
      <FilterReach selectedTab={undefined} defaultSelectedTab={undefined} disabled />
      <FilterSort selectedTab={undefined} defaultSelectedTab={undefined} disabled />
      {children}
      <FilterContent selectedTab={undefined} defaultSelectedTab={undefined} disabled />
    </Container>
  );
}

/**
 * SinglePostLayoutFilter
 *
 * Layout filter bound to the home store. Isolated in its own component so the
 * store subscription only exists where the layout filter is actually rendered.
 */
function SinglePostLayoutFilter() {
  const layout = useHomeStore((state) => state.layout);
  const setLayout = useHomeStore((state) => state.setLayout);

  return <FilterLayout selectedTab={layout} onTabChange={setLayout} />;
}

/**
 * SinglePostLeftSidebar
 *
 * Left sidebar for SinglePost page (desktop).
 */
export function SinglePostLeftSidebar() {
  return (
    <SinglePostFilters>
      <SinglePostLayoutFilter />
    </SinglePostFilters>
  );
}

/**
 * SinglePostLeftDrawer
 *
 * Left drawer for SinglePost page outside mobile drawer contexts.
 */
export function SinglePostLeftDrawer() {
  return (
    <SinglePostFilters>
      <SinglePostLayoutFilter />
    </SinglePostFilters>
  );
}

/**
 * SinglePostLeftDrawerMobile
 *
 * Left drawer for SinglePost page on mobile viewports. Omits the layout filter
 * entirely, so it never subscribes to the home store.
 */
export function SinglePostLeftDrawerMobile() {
  return <SinglePostFilters />;
}
