'use client';

import { useTranslations } from 'next-intl';
import * as Atoms from '@/atoms';

/**
 * TimelineLoadingMore
 *
 * Loading indicator for when more posts are being fetched.
 */
export function TimelineLoadingMore() {
  const t = useTranslations('common');

  return (
    <Atoms.Container className="flex items-center justify-center py-8">
      <Atoms.Typography size="md" className="text-muted-foreground">
        {t('loadingMorePosts')}
      </Atoms.Typography>
    </Atoms.Container>
  );
}
