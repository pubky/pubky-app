'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Container } from '@/atoms/Container/Container';
import { Typography } from '@/atoms/Typography/Typography';
import { AvatarGroup } from '../AvatarGroup/AvatarGroup';

import type { HotTagCardProps } from './HotTagCard.types';
import { cn, generateRandomColor } from '@/libs/utils/utils';
import { TIMEFRAME } from '@/stores/hot/hot.types';
const TIMEFRAME_TRANSLATION_KEY = {
  [TIMEFRAME.TODAY]: 'postsCountToday',
  [TIMEFRAME.THIS_WEEK]: 'postsCountThisWeek',
  [TIMEFRAME.THIS_MONTH]: 'postsCountThisMonth',
  [TIMEFRAME.ALL_TIME]: 'postsCountAllTime',
} as const;

/**
 * HotTagCard
 *
 * A featured card displaying a trending tag with its rank, post count, and top taggers.
 * Used in the Hot Tags section to highlight the top 3 trending tags.
 */
export function HotTagCard({
  rank,
  tagName,
  postCount,
  timeframe,
  taggers = [],
  maxAvatars = 6,
  onClick,
  className,
  'data-testid': dataTestId,
}: HotTagCardProps) {
  const t = useTranslations('hot');
  const tagColor = React.useMemo(() => generateRandomColor(tagName), [tagName]);

  const handleClick = () => {
    onClick?.(tagName);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick?.(tagName);
    }
  };

  return (
    <Container
      overrideDefaults
      className={cn(
        'relative flex min-h-fit min-w-0 flex-1 cursor-pointer flex-col gap-4 overflow-hidden rounded-md px-0 py-6 shadow-sm transition-opacity hover:opacity-90',
        className,
      )}
      style={{
        background: `linear-gradient(90deg, rgba(5, 5, 10, 0.7) 0%, rgba(5, 5, 10, 0.7) 100%), ${tagColor}`,
      }}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      tabIndex={onClick ? 0 : undefined}
      role={onClick ? 'button' : undefined}
      data-testid={dataTestId || `hot-tag-card-${rank}`}
    >
      {/* Card Content */}
      <Container overrideDefaults className="flex w-full flex-col gap-1 px-6 sm:gap-2.5">
        {/* Rank and Tag Name */}
        <Container overrideDefaults className="flex w-full items-center gap-2 sm:gap-3">
          <Container overrideDefaults className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
            <Container
              overrideDefaults
              className="flex size-6 shrink-0 items-center justify-center rounded-full border border-accent-foreground"
            >
              <Typography size="sm" className="font-bold">
                {rank}
              </Typography>
            </Container>
            <Typography as="h4" size="lg" className="max-w-48 truncate lg:leading-normal">
              {tagName}
            </Typography>
          </Container>

          {taggers.length > 0 && (
            <Container
              overrideDefaults
              className="flex shrink-0 items-center sm:hidden"
              data-testid="hot-tag-card-mobile-avatars"
            >
              <AvatarGroup items={taggers} totalCount={postCount} maxAvatars={maxAvatars} />
            </Container>
          )}
        </Container>

        {/* Post Count */}
        <Typography size="md" className="text-secondary-foreground">
          {t(TIMEFRAME_TRANSLATION_KEY[timeframe], { count: postCount.toLocaleString() })}
        </Typography>
      </Container>

      {/* Card Footer - Avatar Group */}
      {taggers.length > 0 && (
        <Container overrideDefaults className="hidden px-6 sm:flex" data-testid="hot-tag-card-desktop-avatars">
          <AvatarGroup items={taggers} totalCount={postCount} maxAvatars={maxAvatars} />
        </Container>
      )}
    </Container>
  );
}
