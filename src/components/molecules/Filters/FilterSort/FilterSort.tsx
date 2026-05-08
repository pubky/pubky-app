'use client';

import * as React from 'react';
import { Flame, SquareAsterisk } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { SORT, type SortType } from '@/stores/home/home.types';
import { FilterRadioGroup } from '../FilterRadioGroup/FilterRadioGroup';
import { BaseFilterProps } from '../Filters.types';

export function FilterSort({
  selectedTab,
  defaultSelectedTab = SORT.TIMELINE,
  onTabChange,
  disabled,
}: BaseFilterProps<SortType>) {
  const t = useTranslations('filters.sort');
  const items = React.useMemo(
    () => [
      {
        key: SORT.TIMELINE,
        label: t('recent'),
        icon: SquareAsterisk,
        disabled,
      },
      {
        key: SORT.ENGAGEMENT,
        label: t('popularity'),
        icon: Flame,
        disabled,
      },
    ],
    [t, disabled],
  );
  return (
    <FilterRadioGroup
      title={t('title')}
      items={items}
      selectedValue={selectedTab}
      defaultValue={defaultSelectedTab}
      onChange={onTabChange}
      dataCy="filter-sort-radiogroup"
    />
  );
}
