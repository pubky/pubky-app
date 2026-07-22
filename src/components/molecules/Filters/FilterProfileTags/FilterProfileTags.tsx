'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Container } from '@/atoms/Container/Container';
import { Tooltip, TooltipContent, TooltipPortal, TooltipTrigger } from '@/atoms/Tooltip/Tooltip';
import { useIsMobile } from '@/hooks/useIsMobile/useIsMobile';
import { cn } from '@/libs/utils/utils';
import { PostTag } from '@/molecules/PostTag/PostTag';
import { TagInput } from '@/molecules/TagInput/TagInput';
import { HOME_PROFILE_TAGS_MAX_SELECTED, REACH, type ReachType } from '@/stores/home/home.types';
import type { FilterProfileTagsProps } from './FilterProfileTags.types';

function profileTagTooltipForReach(
  reach: ReachType | undefined,
  t: ReturnType<typeof useTranslations<'filters.reach'>>,
): string | null {
  if (reach === undefined) return null;

  switch (reach) {
    case REACH.ALL:
      return null;
    case REACH.NETWORK:
      return t('profileTagTooltip.network');
    case REACH.FOLLOWING:
      return t('profileTagTooltip.following');
    case REACH.FRIENDS:
      // Friends + profile tags uses the same depth-1 request as Following in V1.
      return t('profileTagTooltip.friends');
    case REACH.ME:
      return t('profileTagTooltip.me');
    default: {
      const _exhaustive: never = reach;
      return _exhaustive;
    }
  }
}

export function FilterProfileTags({
  selectedTags,
  onTagAdd,
  onTagRemove,
  reach,
  disabled = false,
  maxTags = HOME_PROFILE_TAGS_MAX_SELECTED,
}: FilterProfileTagsProps) {
  const t = useTranslations('filters.reach');
  const isMobile = useIsMobile();

  // The store clears selected tags the moment a gated reach (All) is picked,
  // which would unmount the chips before the collapse animation can play. Freeze
  // the last tags shown while disabled so tags and input collapse together.
  const [frozenTags, setFrozenTags] = useState(selectedTags);
  if (!disabled && frozenTags !== selectedTags) {
    setFrozenTags(selectedTags);
  }
  const displayTags = disabled ? frozenTags : selectedTags;

  const isAtLimit = displayTags.length >= maxTags;
  const isInputDisabled = disabled || isAtLimit;
  const existingTags = displayTags.map((label) => ({ label }));
  const tooltipText = profileTagTooltipForReach(reach, t);
  const showTooltip = !isMobile && tooltipText !== null;

  const handleTagAdd = (tag: string) => {
    const normalizedTag = tag.trim().toLowerCase();
    if (!normalizedTag || selectedTags.length >= maxTags) {
      return;
    }
    onTagAdd(normalizedTag);
  };

  const tagInput = (
    <TagInput
      onTagAdd={handleTagAdd}
      placeholder={t('profileTag')}
      existingTags={existingTags}
      viewerTags={existingTags}
      disabled={isInputDisabled}
      maxTags={maxTags}
      currentTagsCount={displayTags.length}
      limitReachedPlaceholder={t('profileTagLimitReached', { max: maxTags })}
      showEmojiButton={!isAtLimit}
      enableApiSuggestions
      excludeFromApiSuggestions={displayTags}
      addOnSuggestionClick
      className="w-32"
    />
  );

  return (
    <Container
      overrideDefaults
      aria-hidden={disabled}
      className={cn(
        'grid w-full transition-all duration-300 ease-in-out',
        disabled ? 'pointer-events-none grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100',
      )}
    >
      <Container overrideDefaults className="overflow-hidden">
        <Container overrideDefaults className="flex w-full flex-col gap-1 py-1">
          {displayTags.map((tag) => (
            <PostTag
              key={tag}
              label={tag}
              showClose
              onClose={() => onTagRemove(tag)}
              className="w-32 justify-between"
            />
          ))}

          {showTooltip ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex w-32">{tagInput}</span>
              </TooltipTrigger>
              <TooltipPortal>
                <TooltipContent side="bottom">{tooltipText}</TooltipContent>
              </TooltipPortal>
            </Tooltip>
          ) : (
            tagInput
          )}
        </Container>
      </Container>
    </Container>
  );
}
