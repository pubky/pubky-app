'use client';

import { useTranslations } from 'next-intl';
import { Card, CardContent } from '@/atoms/Card/Card';
import { Container } from '@/atoms/Container/Container';
import { Typography } from '@/atoms/Typography/Typography';
import { cn } from '@/libs/utils/utils';

interface CollectionMissingProps {
  className?: string;
}

/**
 * CollectionMissing
 *
 * Drop-in replacement for `CollectionCard` when the underlying collection post
 * can't be found (a 404 from Nexus — `usePostDetails` resolves to `null` once
 * the fetch settles). Mirrors `CollectionDeleted` (and therefore the regular
 * `CollectionCard` shell: outer block sizing + Card chrome + CardContent
 * padding) so the not-found slot keeps the same footprint in any grid it lands
 * in, swapping only the copy to "Collection not found.".
 *
 * Fully self-contained — callers render `<CollectionMissing />` without
 * additional wrappers.
 */
export const CollectionMissing = ({ className }: CollectionMissingProps) => {
  const t = useTranslations('collections');

  return (
    <Container overrideDefaults className={cn('relative block h-full w-full lg:max-w-187', className)}>
      <Card className="relative h-full gap-0 overflow-hidden rounded-md py-0">
        <CardContent className="flex h-full flex-col items-center justify-center gap-3 p-6">
          <Typography size="sm" className="text-center font-normal text-muted-foreground">
            {t('missing')}
          </Typography>
        </CardContent>
      </Card>
    </Container>
  );
};
