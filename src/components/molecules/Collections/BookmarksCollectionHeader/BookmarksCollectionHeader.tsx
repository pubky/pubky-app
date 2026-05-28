import { CircleUserRound, StickyNote } from 'lucide-react';
import { Container } from '@/atoms/Container/Container';
import { Typography } from '@/atoms/Typography/Typography';
import { AvatarWithFallback } from '@/organisms/AvatarWithFallback/AvatarWithFallback';

interface BookmarksCollectionHeaderProps {
  title: string;
  description: string;
  ownerName: string;
  visibilityLabel: string;
  postCount: number;
  ownerAvatarUrl?: string;
  ownerSeed?: string;
}

export function BookmarksCollectionHeader({
  title,
  description,
  ownerName,
  visibilityLabel,
  postCount,
  ownerAvatarUrl,
  ownerSeed,
}: BookmarksCollectionHeaderProps) {
  const postCountLabel = String(postCount);

  return (
    <Container
      data-testid="bookmarks-collection-header"
      overrideDefaults
      className="flex w-full flex-col gap-4 rounded-md bg-card p-6 lg:p-12"
    >
      <Typography
        as="h1"
        overrideDefaults
        className="w-full text-5xl leading-none font-bold break-words text-white lg:text-6xl"
      >
        {title}
      </Typography>

      <Container overrideDefaults className="flex w-full flex-wrap items-center gap-6">
        <Container overrideDefaults className="flex min-w-0 flex-1 items-center gap-3 lg:flex-none">
          <AvatarWithFallback
            avatarUrl={ownerAvatarUrl}
            name={ownerName}
            fallbackSeed={ownerSeed ?? ownerName}
            size="md"
            alt={ownerName}
          />
          <Typography
            as="span"
            overrideDefaults
            className="min-w-0 flex-1 truncate text-xl leading-7 font-bold text-white"
          >
            {ownerName}
          </Typography>
        </Container>

        <Container overrideDefaults className="flex shrink-0 items-center gap-3 text-muted-foreground">
          <Container overrideDefaults className="flex items-center gap-1">
            <StickyNote className="size-3" strokeWidth={2} />
            <Typography as="span" overrideDefaults className="text-xs leading-4 font-medium tracking-[1.2px] uppercase">
              {postCountLabel}
            </Typography>
          </Container>
          <Container overrideDefaults className="flex items-center gap-1">
            <CircleUserRound className="size-4" strokeWidth={2} />
            <Typography as="span" overrideDefaults className="text-xs leading-4 font-medium tracking-[1.2px] uppercase">
              {visibilityLabel}
            </Typography>
          </Container>
        </Container>
      </Container>

      <Typography
        as="p"
        overrideDefaults
        className="w-full text-xl leading-7 font-light text-muted-foreground lg:text-2xl lg:leading-8"
      >
        {description}
      </Typography>
    </Container>
  );
}
