'use client';

import { useTranslations } from 'next-intl';
import * as Atoms from '@/atoms';

/**
 * TimelineEndMessage
 *
 * Message displayed when user has reached the end of the timeline.
 */
export function TimelineEndMessage() {
  const t = useTranslations('empty');

  return (
    <Atoms.Container className="flex items-center justify-center py-8">
      <Atoms.Typography size="md" className="text-muted-foreground">
        {t('endOfFeed')}
      </Atoms.Typography>
    </Atoms.Container>
  );
}
