'use client';

import { useTranslations } from 'next-intl';
import { Card, CardContent } from '@/atoms/Card/Card';
import { Container } from '@/atoms/Container/Container';
import { Typography } from '@/atoms/Typography/Typography';
import { cn } from '@/libs/utils/utils';

interface CollectionDeletedProps {
  className?: string;
}

/**
 * CollectionDeleted
 *
 * Drop-in replacement for `CollectionCard` when the underlying collection
 * post is soft-deleted (`content === '[DELETED]'`). Mirrors the regular
 * `CollectionCard` shell (outer block sizing + Card chrome + CardContent
 * padding) so the deleted-state slot has the same footprint in any grid it
 * lands in, and centers the standard "deleted" message à la `PostDeleted`.
 *
 * Fully self-contained — callers render `<CollectionDeleted />` without
 * additional wrappers.
 */
export const CollectionDeleted = ({ className }: CollectionDeletedProps) => {
  const t = useTranslations('collections');

  return (
    <Container overrideDefaults className={cn('relative block h-full w-full', className)}>
      <Card className="relative h-full gap-0 overflow-hidden rounded-md py-0">
        <CardContent className="flex h-full flex-col items-center justify-center gap-3 p-6">
          <Typography size="sm" className="text-center font-normal text-muted-foreground">
            {t('deleted')}
          </Typography>
        </CardContent>
      </Card>
    </Container>
  );
};
