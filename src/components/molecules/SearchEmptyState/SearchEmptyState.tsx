'use client';

import { useTranslations } from 'next-intl';
import * as Libs from '@/libs';
import * as Molecules from '@/molecules';

/**
 * Search Empty State Component
 *
 * Displayed when no tags are provided in the URL.
 * Guides the user on how to search for posts.
 */
export function SearchEmptyState() {
  const t = useTranslations('search.empty');

  return (
    <Molecules.ProfilePageEmptyState
      imageSrc="/images/tagged-empty-state.webp"
      imageAlt={t('alt')}
      icon={Libs.Search}
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
