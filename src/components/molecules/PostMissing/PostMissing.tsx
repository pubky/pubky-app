'use client';

import { useTranslations } from 'next-intl';
import { CardContent } from '@/atoms/Card/Card';
import { Typography } from '@/atoms/Typography/Typography';

/**
 * PostMissing
 *
 * Drop-in replacement for a post's content when the underlying post can't be
 * found (a 404 from Nexus — `usePostDetails` resolves to `null` once the fetch
 * settles). Mirrors `PostDeleted` exactly but with "not found" copy, so the
 * embedded post card shows a terminal message instead of skeletoning forever.
 *
 * Like `PostDeleted`, this IS the `CardContent` — render it as a direct child of
 * a `<Card>`, not nested inside another `CardContent`.
 */
export const PostMissing = () => {
  const t = useTranslations('post');

  return (
    <CardContent className="flex flex-1 items-center justify-center py-2">
      <Typography size="sm" className="text-center font-normal text-muted-foreground">
        {t('missing')}
      </Typography>
    </CardContent>
  );
};
