'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import * as Libs from '@/libs';
import * as Core from '@/core';
import * as Molecules from '@/molecules';

export function FilterSort({
  selectedTab,
  defaultSelectedTab = Core.SORT.TIMELINE,
  onTabChange,
  disabled,
}: Molecules.BaseFilterProps<Core.SortType>) {
  const t = useTranslations('filters.sort');

  const items = React.useMemo(
    () => [
      { key: Core.SORT.TIMELINE, label: t('recent'), icon: Libs.SquareAsterisk, disabled },
      { key: Core.SORT.ENGAGEMENT, label: t('popularity'), icon: Libs.Flame, disabled },
    ],
    [t, disabled],
  );

  return (
    <Molecules.FilterRadioGroup
      title={t('title')}
      items={items}
      selectedValue={selectedTab}
      defaultValue={defaultSelectedTab}
      onChange={onTabChange}
      dataCy="filter-sort-radiogroup"
    />
  );
}
