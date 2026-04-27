'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import * as Core from '@/core';
import * as Molecules from '@/molecules';
import { Radio, HeartHandshake } from 'lucide-react';
import { UsersRound2 } from '@/icons';
export function FilterReach({
  selectedTab,
  defaultSelectedTab = Core.REACH.ALL,
  onTabChange,
  disabled,
}: Molecules.BaseFilterProps<Core.ReachType>) {
  const t = useTranslations('filters.reach');
  const items = React.useMemo(
    () => [
      {
        key: Core.REACH.ALL,
        label: t('all'),
        icon: Radio,
        disabled,
      },
      {
        key: Core.REACH.FOLLOWING,
        label: t('following'),
        icon: UsersRound2,
        disabled,
      },
      {
        key: Core.REACH.FRIENDS,
        label: t('friends'),
        icon: HeartHandshake,
        disabled,
      },
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
      testId="filter-reach-radiogroup"
      dataCy="filter-reach-radiogroup"
    />
  );
}
