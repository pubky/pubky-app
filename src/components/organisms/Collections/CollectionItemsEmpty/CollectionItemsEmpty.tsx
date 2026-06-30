'use client';

import { useTranslations } from 'next-intl';
import { Container } from '@/atoms/Container/Container';
import { Typography } from '@/atoms/Typography/Typography';

interface CollectionItemsEmptyProps {
  dataCy?: string;
}

export function CollectionItemsEmpty({ dataCy = 'collection-items-empty' }: CollectionItemsEmptyProps) {
  const t = useTranslations('collections.single');

  return (
    <Container overrideDefaults data-cy={dataCy} className="w-full">
      <Typography overrideDefaults className="text-center text-base font-medium text-muted-foreground">
        {t('empty')}
      </Typography>
    </Container>
  );
}
