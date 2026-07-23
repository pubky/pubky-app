'use client';

import * as React from 'react';
import { HeartHandshake, Radio, UserRound, Waypoints } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { UsersRound2 } from '@/icons';
import { REACH, type ReachType } from '@/stores/home/home.types';
import { FilterProfileTags } from '../FilterProfileTags/FilterProfileTags';
import { FilterRadioGroup } from '../FilterRadioGroup/FilterRadioGroup';
import type { BaseFilterProps, FilterListItem } from '../Filters.types';

interface FilterReachProps extends BaseFilterProps<ReachType> {
  showNetwork?: boolean;
  showMe?: boolean;
  profileTags?: string[];
  onProfileTagAdd?: (tag: string) => void;
  onProfileTagRemove?: (tag: string) => void;
  profileTagsDisabled?: boolean;
}

export function FilterReach({
  selectedTab,
  defaultSelectedTab = REACH.ALL,
  onTabChange,
  disabled,
  showNetwork = false,
  showMe = false,
  profileTags,
  onProfileTagAdd,
  onProfileTagRemove,
  profileTagsDisabled = false,
}: FilterReachProps) {
  const t = useTranslations('filters.reach');
  const items = React.useMemo(() => {
    const reachItems: FilterListItem<ReachType>[] = [
      {
        key: REACH.ALL,
        label: t('all'),
        icon: Radio,
        disabled,
      },
    ];

    if (showNetwork) {
      reachItems.push({
        key: REACH.NETWORK,
        label: t('network'),
        icon: Waypoints,
        disabled,
      });
    }

    reachItems.push(
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
    );

    if (showMe) {
      reachItems.push({
        key: REACH.ME,
        label: t('me'),
        icon: UserRound,
        disabled,
      });
    }

    return reachItems;
  }, [t, disabled, showNetwork, showMe]);
  return (
    <FilterRadioGroup
      title={t('title')}
      items={items}
      selectedValue={selectedTab}
      defaultValue={defaultSelectedTab}
      onChange={onTabChange}
      testId="filter-reach-radiogroup"
      dataCy="filter-reach-radiogroup"
    >
      {profileTags && onProfileTagAdd && onProfileTagRemove ? (
        <FilterProfileTags
          selectedTags={profileTags}
          onTagAdd={onProfileTagAdd}
          onTagRemove={onProfileTagRemove}
          disabled={profileTagsDisabled}
        />
      ) : null}
    </FilterRadioGroup>
  );
}
