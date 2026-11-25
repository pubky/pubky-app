'use client';

import type * as React from 'react';
import { Tooltip, TooltipContent, TooltipPortal, TooltipTrigger } from '../Tooltip/Tooltip';

export interface HintTooltipProps {
  /** The tooltip's text; without one the child renders alone. */
  hint?: string;
  /** The element the tooltip points at, in place and unchanged: it receives the trigger's ref and handlers. */
  children: React.ReactElement;
}

/** A short text tooltip on an element, such as a count, that keeps its own layout. */
export function HintTooltip({ hint, children }: HintTooltipProps) {
  if (!hint) return children;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipPortal>
        <TooltipContent>{hint}</TooltipContent>
      </TooltipPortal>
    </Tooltip>
  );
}
