'use client';

import type { ComponentProps, ReactNode } from 'react';
import { Tooltip, TooltipContent, TooltipPortal, TooltipTrigger } from '@/atoms/Tooltip/Tooltip';
import { Typography } from '@/atoms/Typography/Typography';
import { useIsMobile } from '@/hooks/useIsMobile/useIsMobile';

interface RelativeTimestampProps {
  timeAgo: string;
  /** When provided, shows exact date/time in a tooltip on hover (desktop only) */
  date?: Date | null;
  className?: string;
  as?: ComponentProps<typeof Typography>['as'];
  overrideDefaults?: boolean;
  /** Optional content rendered before the time label (e.g. Clock icon) */
  leading?: ReactNode;
  /** Classes for the tooltip trigger wrapper around leading + label */
  triggerClassName?: string;
}

export function RelativeTimestamp({
  timeAgo,
  date,
  className,
  as = 'span',
  overrideDefaults,
  leading,
  triggerClassName,
}: RelativeTimestampProps) {
  const isMobile = useIsMobile();
  const label = (
    <>
      {leading}
      <Typography as={as} className={className} overrideDefaults={overrideDefaults}>
        {timeAgo}
      </Typography>
    </>
  );

  const showTooltip = !isMobile && !!date;
  if (!showTooltip) {
    return label;
  }

  const exactTimeLabel = date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'medium',
  });

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={triggerClassName}>{label}</span>
      </TooltipTrigger>
      <TooltipPortal>
        <TooltipContent>{exactTimeLabel}</TooltipContent>
      </TooltipPortal>
    </Tooltip>
  );
}
