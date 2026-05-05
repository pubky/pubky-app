'use client';

import { Tag } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { ProfilePageEmptyState } from '../ProfilePageEmptyState/ProfilePageEmptyState';
import { TagInput } from '../TagInput/TagInput';
import type { TaggedEmptyProps } from './TaggedEmpty.types';

export function TaggedEmpty({ onTagAdd }: TaggedEmptyProps) {
  const t = useTranslations('profile.empty.tagged');

  return (
    <ProfilePageEmptyState
      imageSrc="/images/tagged-empty-state.webp"
      imageAlt={t('alt')}
      icon={Tag}
      title={t('title')}
      subtitle={t('subtitle')}
    >
      {onTagAdd && <TagInput onTagAdd={onTagAdd} enableApiSuggestions addOnSuggestionClick />}
    </ProfilePageEmptyState>
  );
}
