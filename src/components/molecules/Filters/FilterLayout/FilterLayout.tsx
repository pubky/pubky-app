'use client';

import * as React from 'react';
import { Columns3, LayoutGrid, Rows2, Rows4 } from 'lucide-react';
import { LAYOUT, type LayoutType } from '@/stores/home/home.types';
import { FilterRadioGroup } from '../FilterRadioGroup/FilterRadioGroup';
import { BaseFilterProps, FilterListItem } from '../Filters.types';

interface FilterLayoutProps extends BaseFilterProps<LayoutType> {
  showVisual?: boolean;
}
export function FilterLayout({
  selectedTab,
  defaultSelectedTab = LAYOUT.COLUMNS,
  onTabChange,
  disabled,
  showVisual = false,
}: FilterLayoutProps) {
  const displaySelectedTab = !showVisual && selectedTab === LAYOUT.VISUAL ? LAYOUT.COLUMNS : selectedTab;
  const items = React.useMemo(
    () =>
      [
        {
          key: LAYOUT.COLUMNS,
          label: 'Columns',
          icon: Columns3,
          disabled,
          dataCy: 'columns-layout-toggle',
        },
        {
          key: LAYOUT.WIDE,
          label: 'Wide',
          icon: Rows2,
          disabled,
          dataCy: 'wide-layout-toggle',
        },
        {
          key: LAYOUT.LIST,
          label: 'List',
          icon: Rows4,
          disabled,
          dataCy: 'list-layout-toggle',
        },
        showVisual
          ? {
              key: LAYOUT.VISUAL,
              label: 'Visual',
              icon: LayoutGrid,
              disabled,
              dataCy: 'visual-layout-toggle',
            }
          : null,
      ].filter(Boolean) as FilterListItem<LayoutType>[],
    [disabled, showVisual],
  );
  return (
    <FilterRadioGroup
      title={'Layout'}
      items={items}
      selectedValue={displaySelectedTab}
      defaultValue={defaultSelectedTab}
      onChange={onTabChange}
      dataCy="filter-layout-radiogroup"
    />
  );
}
