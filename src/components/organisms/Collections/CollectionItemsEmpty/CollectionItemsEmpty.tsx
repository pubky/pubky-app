'use client';
import { Container } from '@/atoms/Container/Container';
import { Typography } from '@/atoms/Typography/Typography';

interface CollectionItemsEmptyProps {
  dataCy?: string;
}

export function CollectionItemsEmpty({ dataCy = 'collection-items-empty' }: CollectionItemsEmptyProps) {
  return (
    <Container overrideDefaults data-cy={dataCy} className="w-full">
      <Typography overrideDefaults className="text-center text-base font-medium text-muted-foreground">
        {'This collection is empty.'}
      </Typography>
    </Container>
  );
}
