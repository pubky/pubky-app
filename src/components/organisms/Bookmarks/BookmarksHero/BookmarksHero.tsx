'use client';
import { Card, CardContent } from '@/atoms/Card/Card';
import { Container } from '@/atoms/Container/Container';
import { Typography } from '@/atoms/Typography/Typography';
import { CollectionCountBadge } from '@/molecules/CollectionCountBadge/CollectionCountBadge';
import { DialogAddContent } from '@/organisms/Collections/DialogAddContent/DialogAddContent';
import { HeroOwner } from '@/organisms/HeroOwner/HeroOwner';

interface BookmarksHeroProps {
  avatarName: string;
  avatarSeed: string;
  avatarUrl?: string;
  bookmarkCount?: number;
  isProfileResolved: boolean;
}

export function BookmarksHero({
  avatarName,
  avatarSeed,
  avatarUrl,
  bookmarkCount,
  isProfileResolved,
}: BookmarksHeroProps) {
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
          {'Bookmarks'}
        </Typography>

        <Container overrideDefaults className="flex w-full flex-wrap items-center gap-3 sm:gap-6">
          <HeroOwner
            name={avatarName}
            fallbackSeed={avatarSeed}
            avatarUrl={avatarUrl}
            isResolved={isProfileResolved}
            size="sm"
          />

          {bookmarkCount !== undefined && <CollectionCountBadge count={bookmarkCount} />}
        </Container>

        <Typography
          overrideDefaults
          className="max-w-full text-xl leading-7 font-light text-muted-foreground md:text-2xl md:leading-8"
        >
          {'Everything you saved for later.'}
        </Typography>

        <Container overrideDefaults className="flex flex-wrap items-center gap-3">
          <DialogAddContent target={{ type: 'bookmarks' }} dataCy="bookmarks-add-content" />
        </Container>
      </CardContent>
    </Card>
  );
}
