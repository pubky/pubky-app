'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import * as Libs from '@/libs';
import * as Core from '@/core';
import * as Molecules from '@/molecules';

export function FilterLayout({
  selectedTab,
  defaultSelectedTab = Core.LAYOUT.COLUMNS,
  onTabChange,
  disabled,
}: Molecules.BaseFilterProps<Core.LayoutType>) {
  const t = useTranslations('filters.layout');

  const items = React.useMemo(
    () => [
      { key: Core.LAYOUT.COLUMNS, label: t('columns'), icon: Libs.Columns3, disabled },
      { key: Core.LAYOUT.WIDE, label: t('wide'), icon: Libs.Menu, disabled },
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
    />
  );
}
