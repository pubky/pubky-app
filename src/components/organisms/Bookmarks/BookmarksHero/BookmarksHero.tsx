'use client';

import { useTranslations } from 'next-intl';
import { Card, CardContent } from '@/atoms/Card/Card';
import { Container } from '@/atoms/Container/Container';
import { Typography } from '@/atoms/Typography/Typography';
import { BookmarkCountBadge } from '@/molecules/BookmarkCountBadge/BookmarkCountBadge';
import { AvatarWithFallback } from '@/organisms/AvatarWithFallback/AvatarWithFallback';

interface BookmarksHeroProps {
  avatarName: string;
  avatarSeed: string;
  avatarUrl?: string;
  bookmarkCount?: number;
}

export function BookmarksHero({ avatarName, avatarSeed, avatarUrl, bookmarkCount }: BookmarksHeroProps) {
  const t = useTranslations('collections.bookmarks');

  return (
    <Card data-cy="bookmarks-hero" className="relative overflow-hidden rounded-md py-0">
      <Container
        overrideDefaults
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-r from-card via-card to-card/60"
      />

      <CardContent className="relative flex flex-col items-start gap-4 p-6 md:p-12">
        <Typography
          as="h1"
          overrideDefaults
          className="min-w-0 text-5xl leading-none font-bold text-foreground md:text-6xl"
        >
          {t('title')}
        </Typography>

        <Container overrideDefaults className="flex w-full flex-wrap items-center gap-3 sm:gap-6">
          <Container overrideDefaults className="flex min-w-0 items-center gap-3">
            <AvatarWithFallback
              avatarUrl={avatarUrl}
              name={avatarName}
              fallbackSeed={avatarSeed}
              size="sm"
              alt={avatarName}
            />
            <Typography
              as="span"
              overrideDefaults
              className="min-w-0 truncate text-xl leading-7 font-bold text-foreground"
            >
              {avatarName}
            </Typography>
          </Container>

          {bookmarkCount !== undefined && <BookmarkCountBadge count={bookmarkCount} />}
        </Container>

        <Typography
          overrideDefaults
          className="max-w-full text-xl leading-7 font-light text-muted-foreground md:text-2xl md:leading-8"
        >
          {t('description')}
        </Typography>
      </CardContent>
    </Card>
  );
}
