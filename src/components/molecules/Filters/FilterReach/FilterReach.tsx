'use client';

import * as React from 'react';
import { HeartHandshake, Radio } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { UsersRound2 } from '@/icons';
import { REACH, type ReachType } from '@/stores/home/home.types';
import { FilterRadioGroup } from '../FilterRadioGroup/FilterRadioGroup';
import { BaseFilterProps } from '../Filters.types';

export function FilterReach({
  selectedTab,
  defaultSelectedTab = REACH.ALL,
  onTabChange,
  disabled,
}: BaseFilterProps<ReachType>) {
  const t = useTranslations('filters.reach');
  const items = React.useMemo(
    () => [
      {
        key: REACH.ALL,
        label: t('all'),
        icon: Radio,
        disabled,
      },
      {
        key: REACH.FOLLOWING,
        label: t('following'),
        icon: UsersRound2,
        disabled,
      },
      {
        key: REACH.FRIENDS,
        label: t('friends'),
        icon: HeartHandshake,
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
      testId="filter-reach-radiogroup"
      dataCy="filter-reach-radiogroup"
    />
  );
}
