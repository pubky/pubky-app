'use client';

import { Flame, SquareAsterisk } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { SORT, type SortType } from '@/stores/home/home.types';
import { FilterDropdown } from '../FilterDropdown/FilterDropdown';
import { BaseFilterProps } from '../Filters.types';

export function FilterSort({
  selectedTab,
  defaultSelectedTab = SORT.TIMELINE,
  onTabChange,
  disabled,
}: BaseFilterProps<SortType>) {
  const t = useTranslations('filters.sort');
  const items = [
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
  ];

  return (
    <FilterDropdown
      title={t('title')}
      items={items}
      selectedValue={selectedTab}
      defaultValue={defaultSelectedTab}
      onChange={onTabChange}
      dataCy="filter-sort-radiogroup"
      testId="filter-sort-dropdown"
    />
  );
}
