'use client';

import { useTranslations } from 'next-intl';
import { ProfilePageEmptyState } from '../ProfilePageEmptyState/ProfilePageEmptyState';

/**
 * Search Empty State Component
 *
 * Displayed when no tags are provided in the URL.
 * Guides the user on how to search for posts.
 */
import { Search } from 'lucide-react';
export function SearchEmptyState() {
  const t = useTranslations('search.empty');
  return (
    <ProfilePageEmptyState
      imageSrc="/images/tagged-empty-state.webp"
      imageAlt={t('alt')}
      icon={Search}
      title={t('title')}
      subtitle={
        <>
          {t('subtitle1')}
          <br />
          {t('subtitle2')}
        </>
      }
    />
  );
}
