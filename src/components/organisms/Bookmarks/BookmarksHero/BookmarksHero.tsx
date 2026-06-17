'use client';

import { useTranslations } from 'next-intl';
import { Card, CardContent } from '@/atoms/Card/Card';
import { Container } from '@/atoms/Container/Container';
import { Typography } from '@/atoms/Typography/Typography';
// TODO: Re-enable the bookmark count badge once the backend exposes an accurate
// posts-only bookmark count. The current `userCounts.bookmarks` total also counts
// bookmarked collections and deleted posts, so it overstates what the grid shows
// (e.g. 60 total vs 5 visible posts). The BE team will add a dedicated count to rewire here.
// import { CollectionCountBadge } from '@/molecules/CollectionCountBadge/CollectionCountBadge';
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
  // TODO: `bookmarkCount` is intentionally not consumed while the count badge is
  // hidden (see import note above). Kept on the props/interface so re-wiring the
  // badge later is a one-line change.
  // bookmarkCount,
  isProfileResolved,
}: BookmarksHeroProps) {
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
          <HeroOwner
            name={avatarName}
            fallbackSeed={avatarSeed}
            avatarUrl={avatarUrl}
            isResolved={isProfileResolved}
            size="sm"
          />

          {/* TODO: Bookmark count badge hidden — see import note above. Re-enable once
              the backend provides an accurate posts-only bookmark count. */}
          {/* {bookmarkCount !== undefined && <CollectionCountBadge count={bookmarkCount} />} */}
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
