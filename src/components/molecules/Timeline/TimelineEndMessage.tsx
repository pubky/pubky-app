'use client';

import { useTranslations } from 'next-intl';
import { Container } from '@/atoms/Container/Container';
import { Typography } from '@/atoms/Typography/Typography';

/**
 * TimelineEndMessage
 *
 * Message displayed when user has reached the end of the timeline.
 */
export function TimelineEndMessage() {
  const t = useTranslations('empty');

  return (
    <Container className="flex items-center justify-center py-8">
      <Typography size="md" className="text-muted-foreground">
        {t('endOfFeed')}
      </Typography>
    </Container>
  );
}
