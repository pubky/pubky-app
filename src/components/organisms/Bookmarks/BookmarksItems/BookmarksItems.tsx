'use client';

import { Bookmark } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Card, CardContent } from '@/atoms/Card/Card';
import { Container } from '@/atoms/Container/Container';
import { Typography } from '@/atoms/Typography/Typography';
import { GRID_FEED_COLUMNS_CLASS, GRID_FEED_GAP_CLASS, TIMELINE_FEED_VARIANT } from '@/config/feed';
import { cn } from '@/libs/utils/utils';
import { TimelineFeed } from '@/organisms/Timeline/Feed/TimelineFeed/TimelineFeed';

interface BookmarksItemsProps {
  bookmarkCount?: number;
  isBookmarkCountLoading: boolean;
}

export function BookmarksItems({ bookmarkCount, isBookmarkCountLoading }: BookmarksItemsProps) {
  const isConfirmedEmpty = !isBookmarkCountLoading && bookmarkCount === 0;

  if (isConfirmedEmpty) {
    return <BookmarksItemsEmpty />;
  }

  return <TimelineFeed variant={TIMELINE_FEED_VARIANT.BOOKMARKS} />;
}

function BookmarksItemsEmpty() {
  const t = useTranslations('collections.bookmarks');

  return (
    <Container
      overrideDefaults
      data-cy="bookmarks-items-empty"
      className={cn('grid', GRID_FEED_COLUMNS_CLASS, GRID_FEED_GAP_CLASS)}
    >
      <Card className="rounded-md border-dashed bg-muted/40 py-0 md:col-span-2 xl:col-span-3">
        <CardContent className="flex flex-col items-center justify-center gap-3 p-8 text-center md:p-12">
          <Container
            overrideDefaults
            className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground"
          >
            <Bookmark className="size-6" />
          </Container>
          <Typography as="h2" overrideDefaults className="text-xl leading-7 font-bold text-foreground">
            {t('emptyTitle')}
          </Typography>
          <Typography overrideDefaults className="max-w-96 text-base leading-6 font-medium text-muted-foreground">
            {t('emptyDescription')}
          </Typography>
        </CardContent>
      </Card>
    </Container>
  );
}
