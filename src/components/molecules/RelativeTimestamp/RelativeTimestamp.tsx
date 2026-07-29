'use client';

import type { ReactNode } from 'react';
import { Tooltip, TooltipContent, TooltipPortal, TooltipTrigger } from '@/atoms/Tooltip/Tooltip';
import { Typography } from '@/atoms/Typography/Typography';

interface RelativeTimestampProps {
  timeAgo: string;
  /** When provided, shows exact date/time in a tooltip on hover (desktop only) */
  date?: Date | null;
  /** Viewport state supplied by the owning component */
  isMobile: boolean;
  className?: string;
  overrideDefaults?: boolean;
  /** Optional content rendered before the time label (e.g. Clock icon) */
  leading?: ReactNode;
  /** Classes for the tooltip trigger wrapper around leading + label */
  triggerClassName?: string;
}

export function RelativeTimestamp({
  timeAgo,
  date,
  isMobile,
  className,
  overrideDefaults,
  leading,
  triggerClassName,
}: RelativeTimestampProps) {
  const label = (
    <>
      {leading}
      <Typography as={'span'} className={className} overrideDefaults={overrideDefaults}>
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
