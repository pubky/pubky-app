'use client';

import { useCustomFeed } from '@/hooks/useCustomFeed/useCustomFeed';
import { Container } from '@/atoms/Container/Container';
import { FilterContent } from '@/molecules/Filters/FilterContent/FilterContent';
import { FilterLayout } from '@/molecules/Filters/FilterLayout/FilterLayout';
import { FilterReach } from '@/molecules/Filters/FilterReach/FilterReach';
import { FilterSort } from '@/molecules/Filters/FilterSort/FilterSort';

import { CONTENT } from '@/stores/home/home.types';
import {
  pubkyLayoutToHomeLayout,
  pubkyPostKindToHomeContent,
  pubkyReachToHomeReach,
  pubkySortToHomeSort,
} from '@/utils/pubky-app-spec-feed-mappers';
interface CustomFeedFiltersProps {
  variant: 'sidebar' | 'drawer';
}

export function CustomFeedFilters({ variant }: CustomFeedFiltersProps) {
  const customFeed = useCustomFeed();
  const reach = customFeed?.reach !== undefined ? pubkyReachToHomeReach(customFeed.reach) : undefined;
  const sort = customFeed?.sort !== undefined ? pubkySortToHomeSort(customFeed.sort) : undefined;
  const layout = customFeed?.layout !== undefined ? pubkyLayoutToHomeLayout(customFeed.layout) : undefined;
  const content =
    customFeed?.content === null
      ? CONTENT.ALL
      : customFeed?.content !== undefined
        ? pubkyPostKindToHomeContent(customFeed.content)
        : undefined;

  return (
    <Container overrideDefaults className="flex flex-col gap-6">
      <FilterReach selectedTab={reach} defaultSelectedTab={undefined} disabled />

      <FilterSort selectedTab={sort} defaultSelectedTab={undefined} disabled />

      {variant === 'sidebar' ? (
        <Container overrideDefaults className="sticky top-[100px] flex w-full flex-col gap-6 self-start">
          <FilterLayout selectedTab={layout} defaultSelectedTab={undefined} disabled showVisual />

          <FilterContent selectedTab={content} defaultSelectedTab={undefined} disabled />
        </Container>
      ) : (
        <>
          <FilterLayout selectedTab={layout} defaultSelectedTab={undefined} disabled showVisual />

          <FilterContent selectedTab={content} defaultSelectedTab={undefined} disabled />
        </>
      )}
    </Container>
  );
}
