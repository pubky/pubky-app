'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import * as Libs from '@/libs';
import * as Core from '@/core';
import * as Molecules from '@/molecules';

interface FilterLayoutProps extends Molecules.BaseFilterProps<Core.LayoutType> {
  showVisual?: boolean;
}

export function FilterLayout({
  selectedTab,
  defaultSelectedTab = Core.LAYOUT.COLUMNS,
  onTabChange,
  disabled,
  showVisual = false,
}: FilterLayoutProps) {
  const t = useTranslations('filters.layout');
  const displaySelectedTab = !showVisual && selectedTab === Core.LAYOUT.VISUAL ? Core.LAYOUT.COLUMNS : selectedTab;

  const items = React.useMemo(
    () =>
      [
        { key: Core.LAYOUT.COLUMNS, label: t('columns'), icon: Libs.Columns3, disabled },
        { key: Core.LAYOUT.WIDE, label: t('wide'), icon: Libs.Menu, disabled },
        showVisual ? { key: Core.LAYOUT.VISUAL, label: t('visual'), icon: Libs.LayoutGrid, disabled } : null,
      ].filter(Boolean) as Molecules.FilterItem<Core.LayoutType>[],
    [t, disabled, showVisual],
  );

  return (
    <Molecules.FilterRadioGroup
      title={t('title')}
      items={items}
      selectedValue={displaySelectedTab}
      defaultValue={defaultSelectedTab}
      onChange={onTabChange}
    />
  );
}
