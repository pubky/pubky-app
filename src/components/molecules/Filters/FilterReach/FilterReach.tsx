'use client';

import * as React from 'react';
import { HeartHandshake, Radio, Tags, UserRound, Waypoints } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { UsersRound2 } from '@/icons';
import { REACH, type ReachType } from '@/stores/home/home.types';
import { FilterProfileTags } from '../FilterProfileTags/FilterProfileTags';
import { FilterRadioGroup } from '../FilterRadioGroup/FilterRadioGroup';
import type { BaseFilterProps, FilterListItem } from '../Filters.types';

export const TAGGED_AS_FILTER_KEY = 'tagged_as' as const;
export type ReachFilterValue = ReachType | typeof TAGGED_AS_FILTER_KEY;

interface FilterReachSharedProps {
  profileTags?: string[];
  onProfileTagAdd?: (tag: string) => void;
  onProfileTagRemove?: (tag: string) => void;
  profileTagsDisabled?: boolean;
}

interface StandardFilterReachProps extends BaseFilterProps<ReachType>, FilterReachSharedProps {
  showTaggedAs?: false;
}

interface TaggedAsFilterReachProps extends BaseFilterProps<ReachFilterValue>, FilterReachSharedProps {
  showTaggedAs: true;
}

type FilterReachProps = StandardFilterReachProps | TaggedAsFilterReachProps;

export function FilterReach({
  selectedTab,
  defaultSelectedTab = REACH.ALL,
  onTabChange,
  disabled,
  showTaggedAs = false,
  profileTags,
  onProfileTagAdd,
  onProfileTagRemove,
  profileTagsDisabled = false,
}: FilterReachProps) {
  const t = useTranslations('filters.reach');
  const reachItems: FilterListItem<ReachFilterValue>[] = showTaggedAs
    ? [
        {
          key: REACH.NETWORK,
          label: t('network'),
          icon: Waypoints,
          disabled,
        },
        {
          key: TAGGED_AS_FILTER_KEY,
          label: t('taggedAs'),
          icon: Tags,
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
        {
          key: REACH.ME,
          label: t('me'),
          icon: UserRound,
          disabled,
        },
        {
          key: REACH.ALL,
          label: t('all'),
          icon: Radio,
          disabled,
        },
      ]
    : [
        {
          key: REACH.ALL,
          label: t('all'),
          icon: Radio,
          disabled,
        },
      ];

  if (!showTaggedAs) {
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
  }

  const handleReachChange = (value: ReachFilterValue) => {
    if (showTaggedAs) {
      (onTabChange as TaggedAsFilterReachProps['onTabChange'])?.(value);
      return;
    }

    if (value !== TAGGED_AS_FILTER_KEY) {
      (onTabChange as StandardFilterReachProps['onTabChange'])?.(value);
    }
  };

  const profileTagEditor =
    profileTags && onProfileTagAdd && onProfileTagRemove ? (
      <FilterProfileTags
        selectedTags={profileTags}
        onTagAdd={onProfileTagAdd}
        onTagRemove={onProfileTagRemove}
        disabled={profileTagsDisabled}
      />
    ) : null;

  return (
    <FilterRadioGroup
      title={t('title')}
      items={reachItems}
      itemExtras={showTaggedAs ? { [TAGGED_AS_FILTER_KEY]: profileTagEditor } : undefined}
      selectedValue={selectedTab}
      defaultValue={defaultSelectedTab}
      onChange={handleReachChange}
      testId="filter-reach-radiogroup"
      dataCy="filter-reach-radiogroup"
    />
  );
}
