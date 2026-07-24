'use client';
import { Container } from '@/atoms/Container/Container';
import { usePostRouteLayout } from '@/hooks/usePostRouteLayout/usePostRouteLayout';
import { FilterContent } from '@/molecules/Filters/FilterContent/FilterContent';
import { FilterLayout } from '@/molecules/Filters/FilterLayout/FilterLayout';
import { FilterReach } from '@/molecules/Filters/FilterReach/FilterReach';
import { FilterSort } from '@/molecules/Filters/FilterSort/FilterSort';

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
 * Layout filter bound to the post route controller. A route override remains
 * temporary; direct post navigation keeps using the persisted home layout.
 */
function SinglePostLayoutFilter() {
  const { layout, setLayout } = usePostRouteLayout();

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
