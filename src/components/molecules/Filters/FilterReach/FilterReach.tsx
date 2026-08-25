'use client';

import * as React from 'react';
import { HeartHandshake, Radio, Tags, UserRound, Waypoints } from 'lucide-react';
import { TAGGED_AS_FILTER_KEY } from '@/config/feed';
import { UsersRound2 } from '@/icons';
import { REACH, type ReachFilterValue, type ReachType } from '@/stores/home/home.types';
import { FilterProfileTags } from '../FilterProfileTags/FilterProfileTags';
import { FilterRadioGroup } from '../FilterRadioGroup/FilterRadioGroup';
import type { BaseFilterProps, FilterListItem } from '../Filters.types';

/**
 * Canonical label + icon for each reach filter value. Single source for every
 * surface that renders a reach (this filter, the feed navigation tab, ...) so
 * they cannot drift apart.
 */
export const REACH_FILTER_META: Record<ReachFilterValue, { label: string; icon: FilterListItem['icon'] }> = {
  [REACH.NETWORK]: { label: 'My network', icon: Waypoints },
  [TAGGED_AS_FILTER_KEY]: { label: 'Tagged as', icon: Tags },
  [REACH.FOLLOWING]: { label: 'Following', icon: UsersRound2 },
  [REACH.FRIENDS]: { label: 'Friends', icon: HeartHandshake },
  [REACH.ME]: { label: 'Me', icon: UserRound },
  [REACH.ALL]: { label: 'All', icon: Radio },
};

/** Cypress hooks for the reach radiogroup — the WoT feed E2E selects by these. */
const REACH_FILTER_DATA_CY: Record<ReachFilterValue, string> = {
  [REACH.NETWORK]: 'network-reach-toggle',
  [TAGGED_AS_FILTER_KEY]: 'tagged-as-reach-toggle',
  [REACH.FOLLOWING]: 'following-reach-toggle',
  [REACH.FRIENDS]: 'friends-reach-toggle',
  [REACH.ME]: 'me-reach-toggle',
  [REACH.ALL]: 'all-reach-toggle',
};

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
  const orderedReachKeys: ReachFilterValue[] = showTaggedAs
    ? [REACH.NETWORK, TAGGED_AS_FILTER_KEY, REACH.FOLLOWING, REACH.FRIENDS, REACH.ME, REACH.ALL]
    : [REACH.ALL, REACH.FOLLOWING, REACH.FRIENDS];

  const reachItems: FilterListItem<ReachFilterValue>[] = orderedReachKeys.map((key) => ({
    key,
    ...REACH_FILTER_META[key],
    disabled,
    dataCy: REACH_FILTER_DATA_CY[key],
  }));

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
      title={'Reach'}
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
