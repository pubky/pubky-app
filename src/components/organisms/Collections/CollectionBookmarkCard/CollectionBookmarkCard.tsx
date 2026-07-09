'use client';

import { Bookmark } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { COLLECTION_ROUTES } from '@/app/routes';
import { Card, CardContent } from '@/atoms/Card/Card';
import { Container } from '@/atoms/Container/Container';
import { Link } from '@/atoms/Link/Link';
import { Typography } from '@/atoms/Typography/Typography';
import { useBookmarksCollectionSummary } from '@/hooks/useBookmarksCollectionSummary/useBookmarksCollectionSummary';
import { cn } from '@/libs/utils/utils';
import { CollectionCountBadge } from '@/molecules/CollectionCountBadge/CollectionCountBadge';
import { AvatarWithFallback } from '@/organisms/AvatarWithFallback/AvatarWithFallback';

interface CollectionBookmarkCardProps {
  className?: string;
}

/**
 * CollectionBookmarkCard
 *
 * Pinned "Bookmarks" card on the Collections landing — represents the
 * user's legacy bookmark feed. Always rendered as the first item inside
 * the "My Collections" section.
 *
 * Self-contained: reads the current-user bookmark count and avatar metadata
 * from `useBookmarksCollectionSummary` and links to the bookmarks route.
 * No required props.
 *
 * The `"PRIVATE"` visibility label that earlier designs included was
 * removed during Phase 3 planning — bookmarks aren't actually scoped
 * private in the current stack, so the label was misleading.
 */
export function CollectionBookmarkCard({ className }: CollectionBookmarkCardProps) {
  const t = useTranslations('collections');
  const { avatarName, avatarSeed, avatarUrl, bookmarkCount } = useBookmarksCollectionSummary();

  const title = t('bookmarks.title');
  const description = t('bookmarks.description');

  return (
    <Link
      overrideDefaults
      href={COLLECTION_ROUTES.BOOKMARKS}
      aria-label={title}
      data-cy="collection-bookmark-card"
      className={cn('block h-full w-full', className)}
    >
      <Card className="h-full gap-3 rounded-md py-0">
        <CardContent className="flex h-full flex-col gap-3 p-6">
          <Container overrideDefaults className="flex w-full flex-wrap items-center gap-2 sm:flex-nowrap">
            <Container overrideDefaults className="flex min-w-0 flex-1 items-center gap-2">
              <Bookmark className="size-6 shrink-0" />
              <Typography
                as="span"
                overrideDefaults
                className="min-w-0 truncate text-xl leading-7 font-bold text-foreground"
              >
                {title}
              </Typography>
              {bookmarkCount !== undefined && <CollectionCountBadge count={bookmarkCount} />}
            </Container>

            <Container overrideDefaults className="flex shrink-0 items-center justify-end">
              <AvatarWithFallback
                avatarUrl={avatarUrl}
                name={avatarName}
                fallbackSeed={avatarSeed}
                size="sm"
                alt={avatarName}
              />
            </Container>
          </Container>

          <Typography
            overrideDefaults
            className="line-clamp-2 min-w-0 text-base leading-6 font-medium wrap-anywhere text-muted-foreground"
          >
            {description}
          </Typography>
        </CardContent>
      </Card>
    </Link>
  );
}
