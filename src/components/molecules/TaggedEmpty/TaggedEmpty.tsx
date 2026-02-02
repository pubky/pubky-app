'use client';

import { Tag } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as Molecules from '@/molecules';
import type { TaggedEmptyProps } from './TaggedEmpty.types';

export function TaggedEmpty({ onTagAdd }: TaggedEmptyProps) {
  const t = useTranslations('profile.empty.tagged');

  return (
    <Molecules.ProfilePageEmptyState
      imageSrc="/images/tagged-empty-state.png"
      imageAlt={t('alt')}
      icon={Tag}
      title={t('title')}
      subtitle={t('subtitle')}
    >
      {onTagAdd && <Molecules.TagInput onTagAdd={onTagAdd} enableApiSuggestions addOnSuggestionClick />}
    </Molecules.ProfilePageEmptyState>
  );
}
