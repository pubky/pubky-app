'use client';

import { useEffect, useState } from 'react';
import { UserRound, UsersRound, Waypoints } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Container } from '@/atoms/Container/Container';
import { FilterHeader, FilterRoot } from '@/atoms/Filter/Filter';
import { cn } from '@/libs/utils/utils';
import { FilterDropdown } from '@/molecules/Filters/FilterDropdown/FilterDropdown';
import { PostTag } from '@/molecules/PostTag/PostTag';
import { TagInput } from '@/molecules/TagInput/TagInput';
import { HOME_PROFILE_TAGS_MAX_SELECTED, REACH } from '@/stores/home/home.types';
import type { FilterProfileTagsProps } from './FilterProfileTags.types';

export function FilterProfileTags({
  selectedTags,
  onTagAdd,
  onTagRemove,
  scope,
  onScopeChange,
  hidden = false,
  inputDisabled = false,
  onInputClick,
  maxTags = HOME_PROFILE_TAGS_MAX_SELECTED,
}: FilterProfileTagsProps) {
  const tReach = useTranslations('filters.reach');
  const tProfile = useTranslations('profile.sidebar');
  const [displayTags, setDisplayTags] = useState(selectedTags);

  useEffect(() => {
    if (!hidden) {
      setDisplayTags(selectedTags);
    }
  }, [hidden, selectedTags]);

  const isAtLimit = displayTags.length >= maxTags;
  const existingTags = displayTags.map((label) => ({ label }));
  const reachItems = [
    {
      key: REACH.NETWORK,
      label: tReach('taggedBy', { reach: tReach('myNetwork').toLocaleLowerCase() }),
      icon: Waypoints,
    },
    {
      key: REACH.FOLLOWING,
      label: tReach('taggedBy', { reach: tReach('following').toLocaleLowerCase() }),
      icon: UsersRound,
    },
    {
      key: REACH.ME,
      label: tReach('taggedBy', { reach: tReach('me').toLocaleLowerCase() }),
      icon: UserRound,
    },
  ];

  const handleTagAdd = (tag: string) => {
    const normalizedTag = tag.trim().toLowerCase();
    if (normalizedTag && selectedTags.length < maxTags) {
      onTagAdd(normalizedTag);
    }
  };

  return (
    <Container
      overrideDefaults
      aria-hidden={hidden}
      className={cn(
        'grid w-full transition-[grid-template-rows,opacity] duration-100 ease-in-out',
        hidden ? 'pointer-events-none grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100',
      )}
      data-testid="filter-profile-tags-collapse"
    >
      <Container overrideDefaults className="min-h-0 overflow-hidden">
        <FilterRoot className="gap-4">
          <FilterHeader title={tProfile('taggedAs')} />

          <Container overrideDefaults className="flex w-full max-w-52 flex-col gap-2">
            <TagInput
              onTagAdd={handleTagAdd}
              placeholder={tReach('profileTag')}
              existingTags={existingTags}
              viewerTags={existingTags}
              disabled={inputDisabled || isAtLimit}
              onClick={onInputClick}
              maxTags={maxTags}
              currentTagsCount={displayTags.length}
              limitReachedPlaceholder={tReach('profileTagLimitReached', { max: maxTags })}
              enableApiSuggestions
              excludeFromApiSuggestions={displayTags}
              addOnSuggestionClick
              className="w-full"
            />

            {displayTags.map((tag) => (
              <PostTag
                key={tag}
                label={tag}
                showClose
                onClose={() => onTagRemove(tag)}
                className="w-full justify-between"
              />
            ))}

            <FilterDropdown
              ariaLabel={tReach('taggedByLabel')}
              items={reachItems}
              selectedValue={scope}
              onChange={onScopeChange}
              dataCy="filter-profile-tag-reach-dropdown"
              testId="filter-profile-tag-reach-dropdown"
            />
          </Container>
        </FilterRoot>
      </Container>
    </Container>
  );
}
