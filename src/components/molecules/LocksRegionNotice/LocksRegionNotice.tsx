'use client';

import { Info } from 'lucide-react';
import type { MouseEvent } from 'react';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Popover, PopoverContent, PopoverTrigger } from '@/atoms/Popover/Popover';
import { Typography } from '@/atoms/Typography/Typography';
import { cn } from '@/libs/utils/utils';
import type { LocksRegionNoticeProps } from './LocksRegionNotice.types';

// In a feed the notice sits inside the post card's click target, which navigates to the post.
const stopCardPropagation = (event: MouseEvent) => event.stopPropagation();

/**
 * Tells a reader or creator that paid unlocks are not offered where they are: one short line, with an info
 * icon for the why. It replaces the action it explains (Unlock, the lock switch, the retry screen) instead
 * of sitting beside a live one, and it is calm, not an error: nothing here can be retried and Bitkit is
 * not involved. The `icon` variant is for a tight toolbar: only the icon shows, and the line moves into
 * what it opens.
 */
export function LocksRegionNotice({ cause = 'region', variant = 'line', className }: LocksRegionNoticeProps) {
  const message =
    cause === 'unknown'
      ? "We can't tell where you are, so paid unlocks are paused."
      : "Paid unlocks aren't available in your region yet.";
  const info =
    cause === 'unknown'
      ? "Paid unlocks depend on where you are, and we couldn't read your location. Free posts, content you already unlocked and everything else in Pubky work as usual."
      : 'Free posts, content you already unlocked and everything else in Pubky work as usual.';
  const isIcon = variant === 'icon';

  return (
    <Container
      overrideDefaults
      role="status"
      data-testid="locks-region-notice"
      className={cn('flex items-center gap-2', className)}
      onClick={stopCardPropagation}
      onAuxClick={stopCardPropagation}
    >
      {!isIcon && (
        <Typography overrideDefaults className="text-base font-medium text-muted-foreground">
          {message}
        </Typography>
      )}
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-6 text-muted-foreground"
            aria-label={isIcon ? message : 'About this limit'}
            data-testid="locks-region-notice-info"
          >
            <Info aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent side="top" align="start" sideOffset={6} className="flex flex-col gap-2 p-3">
          {isIcon && (
            <Typography overrideDefaults className="text-sm font-medium text-popover-foreground">
              {message}
            </Typography>
          )}
          <Typography overrideDefaults className="text-sm text-popover-foreground" data-testid="locks-region-info">
            {info}
          </Typography>
        </PopoverContent>
      </Popover>
    </Container>
  );
}
