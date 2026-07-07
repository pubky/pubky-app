'use client';

import { useTranslations } from 'next-intl';
import { Container } from '@/atoms/Container/Container';
import { cn } from '@/libs/utils/utils';
import { PostTag } from '@/molecules/PostTag/PostTag';
import { TagInput } from '@/molecules/TagInput/TagInput';
import { HOME_PROFILE_TAGS_MAX_SELECTED } from '@/stores/home/home.types';
import type { FilterProfileTagsProps } from './FilterProfileTags.types';

export function FilterProfileTags({
  selectedTags,
  onTagAdd,
  onTagRemove,
  disabled = false,
  maxTags = HOME_PROFILE_TAGS_MAX_SELECTED,
}: FilterProfileTagsProps) {
  const t = useTranslations('filters.reach');
  const isAtLimit = selectedTags.length >= maxTags;
  const isInputDisabled = disabled || isAtLimit;
  const existingTags = selectedTags.map((label) => ({ label }));

  const handleTagAdd = (tag: string) => {
    const normalizedTag = tag.trim().toLowerCase();
    if (!normalizedTag || selectedTags.length >= maxTags) {
      return;
    }
    onTagAdd(normalizedTag);
  };

  return (
    <Container overrideDefaults className="flex w-full flex-col gap-1 py-1">
      {selectedTags.map((tag) => (
        <PostTag key={tag} label={tag} showClose onClose={() => onTagRemove(tag)} className="w-32 justify-between" />
      ))}

      <TagInput
        onTagAdd={handleTagAdd}
        placeholder={t('profileTag')}
        existingTags={existingTags}
        viewerTags={existingTags}
        disabled={isInputDisabled}
        maxTags={maxTags}
        currentTagsCount={selectedTags.length}
        limitReachedPlaceholder={t('profileTagLimitReached', { max: maxTags })}
        enableApiSuggestions
        excludeFromApiSuggestions={selectedTags}
        addOnSuggestionClick
        className={cn('w-32', disabled && 'pointer-events-none opacity-40', isAtLimit && !disabled && 'opacity-60')}
        inputClassName={disabled ? 'disabled:opacity-100' : undefined}
      />
    </Container>
  );
}
