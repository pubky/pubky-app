import { CircleUserRound, StickyNote } from 'lucide-react';
import type { ComponentType } from 'react';
import { Container } from '@/atoms/Container/Container';
import { Link } from '@/atoms/Link/Link';
import { Typography } from '@/atoms/Typography/Typography';
import { cn } from '@/libs/utils/utils';
import { AvatarWithFallback } from '@/organisms/AvatarWithFallback/AvatarWithFallback';

interface CollectionCardProps {
  href: string;
  title: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  count?: number;
  visibilityLabel: string;
  avatarUrl?: string;
  avatarName: string;
  avatarSeed?: string;
  className?: string;
}

export function CollectionCard({
  href,
  title,
  description,
  icon: Icon,
  count,
  visibilityLabel,
  avatarUrl,
  avatarName,
  avatarSeed,
  className,
}: CollectionCardProps) {
  return (
    <Link
      overrideDefaults
      href={href}
      aria-label={title}
      data-cy="collection-card"
      className={cn(
        'flex w-full flex-col items-start justify-center gap-3 rounded-md bg-card p-6 text-card-foreground lg:max-w-[588px]',
        className,
      )}
    >
      <Container overrideDefaults className="flex w-full flex-wrap items-center gap-2 sm:flex-nowrap">
        <Container overrideDefaults className="flex min-w-0 flex-1 items-center gap-2">
          <Icon className="size-6 shrink-0" />
          <Typography
            as="span"
            overrideDefaults
            className="min-w-0 flex-1 text-xl leading-7 font-bold text-foreground sm:truncate"
          >
            {title}
          </Typography>
        </Container>

        <Container overrideDefaults className="flex shrink-0 items-center justify-end gap-2 sm:gap-3">
          {count !== undefined && (
            <Container overrideDefaults className="hidden items-center gap-1 text-muted-foreground sm:flex">
              <StickyNote className="size-3" />
              <Typography
                as="span"
                overrideDefaults
                className="text-xs leading-4 font-medium tracking-[1.2px] uppercase"
              >
                {count}
              </Typography>
            </Container>
          )}
          <Container overrideDefaults className="hidden items-center gap-1 text-muted-foreground sm:flex">
            <CircleUserRound className="h-3 w-4" />
            <Typography as="span" overrideDefaults className="text-xs leading-4 font-medium tracking-[1.2px] uppercase">
              {visibilityLabel}
            </Typography>
          </Container>
          <AvatarWithFallback
            avatarUrl={avatarUrl}
            name={avatarName}
            fallbackSeed={avatarSeed ?? avatarName}
            size="sm"
            alt={avatarName}
          />
        </Container>
      </Container>

      <Typography overrideDefaults className="w-full min-w-0 text-base leading-6 font-medium text-muted-foreground">
        {description}
      </Typography>
    </Link>
  );
}
