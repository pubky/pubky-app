'use client';

import * as React from 'react';
import * as Molecules from '@/molecules';
import { WHO_TO_FOLLOW_SORT } from './FilterSortWhoToFollow.constants';
import type { WhoToFollowSortType } from './FilterSortWhoToFollow.types';

/**
 * FilterSortWhoToFollow
 *
 * Sort filter for the Who To Follow page.
 * Uses the same FilterRadioGroup pattern as other filters.
 * Currently all options are disabled as placeholders for future functionality.
 */
import { Lightbulb, ArrowLeftRight, Users, AtSign } from 'lucide-react';
export function FilterSortWhoToFollow() {
  const items = React.useMemo<Molecules.FilterItem<WhoToFollowSortType>[]>(
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
    <Molecules.FilterRadioGroup
      title="Sort"
      items={items}
      selectedValue={WHO_TO_FOLLOW_SORT.SUGGESTED}
      testId="filter-sort-who-to-follow-radiogroup"
    />
  );
}
