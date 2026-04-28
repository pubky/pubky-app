'use client';

import * as Atoms from '@/atoms';
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
      <Atoms.Typography
        as="span"
        className="text-xs leading-4 font-medium tracking-[0.075rem] whitespace-nowrap text-muted-foreground"
        overrideDefaults
      >
        {timeAgo}
      </Atoms.Typography>
    </>
  );
  const showTooltip = !isMobile && !!indexedAt;
  if (!showTooltip) {
    return (
      <Atoms.Container className="flex flex-shrink-0 items-center gap-1" overrideDefaults>
        {inner}
      </Atoms.Container>
    );
  }
  const exactTimeLabel = indexedAt.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'medium',
  });
  return (
    <Atoms.Container className="flex flex-shrink-0 items-center gap-1" overrideDefaults>
      <Atoms.Tooltip>
        <Atoms.TooltipTrigger asChild>
          <span className="flex flex-shrink-0 items-center gap-1">{inner}</span>
        </Atoms.TooltipTrigger>
        <Atoms.TooltipPortal>
          <Atoms.TooltipContent>{exactTimeLabel}</Atoms.TooltipContent>
        </Atoms.TooltipPortal>
      </Atoms.Tooltip>
    </Atoms.Container>
  );
}
