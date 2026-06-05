'use client';

import { Bookmark, StickyNote } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { COLLECTION_ROUTES } from '@/app/routes';
import { Card, CardContent } from '@/atoms/Card/Card';
import { Container } from '@/atoms/Container/Container';
import { Link } from '@/atoms/Link/Link';
import { Typography } from '@/atoms/Typography/Typography';
import { FileController } from '@/controllers/file/file';
import { UserController } from '@/controllers/user/user';
import { useCurrentUserProfile } from '@/hooks/useCurrentUserProfile/useCurrentUserProfile';
import { useLocalFirstQuery } from '@/hooks/useLocalFirstQuery/useLocalFirstQuery';
import { cn } from '@/libs/utils/utils';
import { AvatarWithFallback } from '@/organisms/AvatarWithFallback/AvatarWithFallback';
import { useLocalFilesStore } from '@/stores/localFiles/localFiles.store';

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
 * Self-contained: derives `count` (current-user bookmark count), avatar
 * URL / name / seed, and href internally. No required props.
 *
 * The `"PRIVATE"` visibility label that earlier designs included was
 * removed during Phase 3 planning — bookmarks aren't actually scoped
 * private in the current stack, so the label was misleading.
 */
export function CollectionBookmarkCard({ className }: CollectionBookmarkCardProps) {
  const t = useTranslations('collections');
  const format = useFormatter();

  const { userDetails, currentUserPubky } = useCurrentUserProfile();
  const localAvatarUrl = useLocalFilesStore((state) => state.profile);

  const { data: userCounts } = useLocalFirstQuery({
    queryFn: () => UserController.getCounts({ userId: currentUserPubky! }),
    fetchFn: () => UserController.fetchCounts({ userId: currentUserPubky! }),
    deps: [currentUserPubky],
    enabled: !!currentUserPubky,
  });

  const avatarUrl =
    localAvatarUrl ??
    (currentUserPubky && userDetails?.image
      ? FileController.getAvatarUrl(currentUserPubky, userDetails.indexed_at)
      : undefined);
  const avatarName = userDetails?.name || 'U';
  const avatarSeed = currentUserPubky ?? avatarName;

  const title = t('bookmarks.title');
  const description = t('bookmarks.description');
  const count = userCounts?.bookmarks;
  // Compact notation (e.g. 1.2K, 3M) keeps long counts from blowing out the
  // header row — matches the CollectionCard count formatting.
  const countLabel = count !== undefined ? format.number(count, { notation: 'compact' }) : null;

  return (
    <Link
      overrideDefaults
      href={COLLECTION_ROUTES.BOOKMARKS}
      aria-label={title}
      data-cy="collection-bookmark-card"
      className={cn('block h-full w-full lg:max-w-187', className)}
    >
      <Card className="h-full gap-3 rounded-md py-0">
        <CardContent className="flex h-full flex-col gap-3 p-6">
          <Container overrideDefaults className="flex w-full flex-wrap items-center gap-2 sm:flex-nowrap">
            <Container overrideDefaults className="flex min-w-0 flex-1 items-center gap-2">
              <Bookmark className="size-6 shrink-0" />
              <Typography
                as="span"
                overrideDefaults
                className="min-w-0 flex-1 truncate text-xl leading-7 font-bold text-foreground"
              >
                {title}
              </Typography>
            </Container>

            <Container overrideDefaults className="flex shrink-0 items-center justify-end gap-2 sm:gap-3">
              {countLabel !== null && (
                <Container overrideDefaults className="flex items-center gap-1 text-muted-foreground">
                  <StickyNote className="size-3" />
                  <Typography
                    as="span"
                    overrideDefaults
                    className="text-xs leading-4 font-medium tracking-[1.2px] uppercase"
                  >
                    {countLabel}
                  </Typography>
                </Container>
              )}
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
            className="line-clamp-2 w-full min-w-0 text-base leading-6 font-medium wrap-anywhere text-muted-foreground"
          >
            {description}
          </Typography>
        </CardContent>
      </Card>
    </Link>
  );
}
