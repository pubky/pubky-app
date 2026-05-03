'use client';

/**
 * FilterSortWhoToFollow
 *
 * Sort filter for the Who To Follow page.
 * Uses the same FilterRadioGroup pattern as other filters.
 * Currently all options are disabled as placeholders for future functionality.
 */
import * as React from 'react';
import { ArrowLeftRight, AtSign, Lightbulb, Users } from 'lucide-react';
import { FilterRadioGroup } from '../FilterRadioGroup/FilterRadioGroup';
import { FilterListItem } from '../Filters.types';
import { WHO_TO_FOLLOW_SORT } from './FilterSortWhoToFollow.constants';
import type { WhoToFollowSortType } from './FilterSortWhoToFollow.types';

export function FilterSortWhoToFollow() {
  const items = React.useMemo<FilterListItem<WhoToFollowSortType>[]>(
    () => [
      {
        key: WHO_TO_FOLLOW_SORT.SUGGESTED,
        label: 'Suggested',
        icon: Lightbulb,
        disabled: true,
      },
      {
        key: WHO_TO_FOLLOW_SORT.MUTUAL,
        label: 'Mutual',
        icon: ArrowLeftRight,
        disabled: true,
      },
      {
        key: WHO_TO_FOLLOW_SORT.FOLLOWERS,
        label: 'Followers',
        icon: Users,
        disabled: true,
      },
      {
        key: WHO_TO_FOLLOW_SORT.USERNAME,
        label: 'Username',
        icon: AtSign,
        disabled: true,
      },
    ],
    [],
  );
  return (
    <FilterRadioGroup
      title="Sort"
      items={items}
      selectedValue={WHO_TO_FOLLOW_SORT.SUGGESTED}
      testId="filter-sort-who-to-follow-radiogroup"
    />
  );
}
