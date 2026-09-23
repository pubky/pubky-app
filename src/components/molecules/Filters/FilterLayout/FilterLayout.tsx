'use client';

import { Columns3, Grid2X2, LayoutDashboard, Rows2, Rows4 } from 'lucide-react';
import { LAYOUT, type LayoutType } from '@/stores/home/home.types';
import { FilterRadioGroup } from '../FilterRadioGroup/FilterRadioGroup';
import { BaseFilterProps, FilterListItem } from '../Filters.types';

interface FilterLayoutProps extends BaseFilterProps<LayoutType> {
  showVisual?: boolean;
  showCards?: boolean;
}
export function FilterLayout({
  selectedTab,
  defaultSelectedTab = LAYOUT.COLUMNS,
  onTabChange,
  disabled,
  showVisual = false,
  showCards = false,
}: FilterLayoutProps) {
  const displaySelectedTab =
    (!showVisual && selectedTab === LAYOUT.VISUAL) || (!showCards && selectedTab === LAYOUT.CARDS)
      ? LAYOUT.COLUMNS
      : selectedTab;
  const items: FilterListItem<LayoutType>[] = [
    { key: LAYOUT.COLUMNS, label: 'Columns', icon: Columns3, disabled, dataCy: 'columns-layout-toggle' },
    { key: LAYOUT.WIDE, label: 'Wide', icon: Rows2, disabled, dataCy: 'wide-layout-toggle' },
    { key: LAYOUT.LIST, label: 'List', icon: Rows4, disabled, dataCy: 'list-layout-toggle' },
    ...(showVisual
      ? [{ key: LAYOUT.VISUAL, label: 'Visual', icon: Grid2X2, disabled, dataCy: 'visual-layout-toggle' }]
      : []),
    ...(showCards
      ? [{ key: LAYOUT.CARDS, label: 'Cards', icon: LayoutDashboard, disabled, dataCy: 'cards-layout-toggle' }]
      : []),
  ];
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
