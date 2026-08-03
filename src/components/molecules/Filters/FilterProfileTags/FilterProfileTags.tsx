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
    <Container
      overrideDefaults
      aria-hidden={disabled}
      inert={disabled}
      className={cn(
        'grid w-full transition-all duration-300 ease-in-out',
        disabled ? 'pointer-events-none grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100',
      )}
    >
      <Container overrideDefaults className="overflow-hidden">
        <Container overrideDefaults className="flex w-full flex-col gap-1 py-1">
          <TagInput
            onTagAdd={handleTagAdd}
            placeholder={t('profileTag')}
            existingTags={existingTags}
            viewerTags={existingTags}
            disabled={isInputDisabled}
            maxTags={maxTags}
            currentTagsCount={selectedTags.length}
            limitReachedPlaceholder={t('profileTagLimitReached', { max: maxTags })}
            showEmojiButton={!isAtLimit}
            enableApiSuggestions
            excludeFromApiSuggestions={selectedTags}
            addOnSuggestionClick
            className="w-32"
          />

          {selectedTags.map((tag) => (
            <PostTag
              key={tag}
              label={tag}
              showClose
              onClose={() => onTagRemove(tag)}
              tabIndex={disabled ? -1 : undefined}
              className="w-32 justify-between"
            />
          ))}
        </Container>
      </Container>
    </Container>
  );
}
