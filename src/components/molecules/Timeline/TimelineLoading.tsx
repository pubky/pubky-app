'use client';

import { useTranslations } from 'next-intl';
import * as Atoms from '@/atoms';

/**
 * TimelineLoading
 *
 * Loading indicator for initial timeline load.
 */
export function TimelineLoading() {
  const t = useTranslations('common');

  return (
    <Atoms.Container data-cy="timeline-container" className="flex items-center justify-center py-8">
      <Atoms.Typography size="md" className="text-muted-foreground">
        {t('loadingPosts')}
      </Atoms.Typography>
    </Atoms.Container>
  );
}
