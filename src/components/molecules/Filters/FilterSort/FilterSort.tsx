'use client';

import * as React from 'react';
import { Flame, SquareAsterisk } from 'lucide-react';
import { SORT, type SortType } from '@/stores/home/home.types';
import { FilterRadioGroup } from '../FilterRadioGroup/FilterRadioGroup';
import { BaseFilterProps } from '../Filters.types';

export function FilterSort({
  selectedTab,
  defaultSelectedTab = SORT.TIMELINE,
  onTabChange,
  disabled,
}: BaseFilterProps<SortType>) {
  const items = React.useMemo(
    () => [
      {
        key: SORT.TIMELINE,
        label: 'Recent',
        icon: SquareAsterisk,
        disabled,
        dataCy: 'recent-sort-toggle',
      },
      {
        key: SORT.ENGAGEMENT,
        label: 'Popularity',
        icon: Flame,
        disabled,
        dataCy: 'popularity-sort-toggle',
      },
    ],
    [disabled],
  );
  return (
    <FilterRadioGroup
      title={'Sort'}
      items={items}
      selectedValue={selectedTab}
      defaultValue={defaultSelectedTab}
      onChange={onTabChange}
      dataCy="filter-sort-radiogroup"
    />
  );
}
