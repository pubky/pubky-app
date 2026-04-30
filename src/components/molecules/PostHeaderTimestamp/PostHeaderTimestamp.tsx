'use client';
import { Container } from '@/atoms/Container/Container';
import { Tooltip, TooltipContent, TooltipPortal, TooltipTrigger } from '@/atoms/Tooltip/Tooltip';
import { Typography } from '@/atoms/Typography/Typography';

import { useIsMobile } from '@/hooks/useIsMobile/useIsMobile';
import { Clock } from 'lucide-react';

interface PostHeaderTimestampProps {
  timeAgo: string;
  /** When provided, shows exact date/time in a tooltip on hover (desktop only) */
  indexedAt?: Date | null;
}
export function PostHeaderTimestamp({ timeAgo, indexedAt }: PostHeaderTimestampProps) {
  const isMobile = useIsMobile();
  const inner = (
    <>
      <Clock className="size-4 text-muted-foreground" />
      <Typography
        as="span"
        className="text-xs leading-4 font-medium tracking-[0.075rem] whitespace-nowrap text-muted-foreground"
        overrideDefaults
      >
        {timeAgo}
      </Typography>
    </>
  );
  const showTooltip = !isMobile && !!indexedAt;
  if (!showTooltip) {
    return (
      <Container className="flex flex-shrink-0 items-center gap-1" overrideDefaults>
        {inner}
      </Container>
    );
  }
  const exactTimeLabel = indexedAt.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'medium',
  });
  return (
    <Container className="flex flex-shrink-0 items-center gap-1" overrideDefaults>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="flex flex-shrink-0 items-center gap-1">{inner}</span>
        </TooltipTrigger>
        <TooltipPortal>
          <TooltipContent>{exactTimeLabel}</TooltipContent>
        </TooltipPortal>
      </Tooltip>
    </Container>
  );
}
