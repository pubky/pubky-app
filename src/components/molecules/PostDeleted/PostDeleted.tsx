'use client';

import { useTranslations } from 'next-intl';
import { CardContent } from '@/atoms/Card/Card';
import { Typography } from '@/atoms/Typography/Typography';

export const PostDeleted = () => {
  const t = useTranslations('post');

  return (
    <CardContent className="flex flex-1 items-center justify-center py-2">
      <Typography size="sm" className="text-center font-normal text-muted-foreground">
        {t('deleted')}
      </Typography>
    </CardContent>
  );
};
