'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import * as Libs from '@/libs';
import * as Core from '@/core';
import * as Molecules from '@/molecules';

export function FilterReach({
  selectedTab,
  defaultSelectedTab = Core.REACH.ALL,
  onTabChange,
}: Molecules.BaseFilterProps<Core.ReachType>) {
  const t = useTranslations('filters.reach');

  const items = React.useMemo(
    () => [
      { key: Core.REACH.ALL, label: t('all'), icon: Libs.Radio },
      { key: Core.REACH.FOLLOWING, label: t('following'), icon: Libs.UsersRound2 },
      { key: Core.REACH.FRIENDS, label: t('friends'), icon: Libs.HeartHandshake },
    ],
    [t],
  );

  return (
    <Molecules.FilterRadioGroup
      title={t('title')}
      items={items}
      selectedValue={selectedTab}
      defaultValue={defaultSelectedTab}
      onChange={onTabChange}
      testId="filter-reach-radiogroup"
      dataCy="filter-reach-radiogroup"
    />
  );
}
