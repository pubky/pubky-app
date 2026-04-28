'use client';

import { useCustomFeed } from '@/hooks/useCustomFeed/useCustomFeed';
import * as Atoms from '@/atoms';
import * as Molecules from '@/molecules';
import * as Core from '@/core';

interface CustomFeedFiltersProps {
  variant: 'sidebar' | 'drawer';
}

export function CustomFeedFilters({ variant }: CustomFeedFiltersProps) {
  const customFeed = useCustomFeed();
  const reach = customFeed?.reach !== undefined ? Core.pubkyReachToHomeReach(customFeed.reach) : undefined;
  const sort = customFeed?.sort !== undefined ? Core.pubkySortToHomeSort(customFeed.sort) : undefined;
  const layout = customFeed?.layout !== undefined ? Core.pubkyLayoutToHomeLayout(customFeed.layout) : undefined;
  const content =
    customFeed?.content === null
      ? Core.CONTENT.ALL
      : customFeed?.content !== undefined
        ? Core.pubkyPostKindToHomeContent(customFeed.content)
        : undefined;

  return (
    <Atoms.Container overrideDefaults className="flex flex-col gap-6">
      <Molecules.FilterReach selectedTab={reach} defaultSelectedTab={undefined} disabled />

      <Molecules.FilterSort selectedTab={sort} defaultSelectedTab={undefined} disabled />

      {variant === 'sidebar' ? (
        <Atoms.Container overrideDefaults className="sticky top-[100px] flex w-full flex-col gap-6 self-start">
          <Molecules.FilterLayout selectedTab={layout} defaultSelectedTab={undefined} disabled showVisual />

          <Molecules.FilterContent selectedTab={content} defaultSelectedTab={undefined} disabled />
        </Atoms.Container>
      ) : (
        <>
          <Molecules.FilterLayout selectedTab={layout} defaultSelectedTab={undefined} disabled showVisual />

          <Molecules.FilterContent selectedTab={content} defaultSelectedTab={undefined} disabled />
        </>
      )}
    </Atoms.Container>
  );
}
