'use client';

import * as React from 'react';
import { Progress as ProgressPrimitive } from 'radix-ui';
import { cn } from '@/libs/utils/utils';
import type { ProgressProps } from './Progress.types';

/** Shadcn progress bar over the Radix primitive; indeterminate (pulsing, full width) without a value. */
const Progress = React.forwardRef<React.ComponentRef<typeof ProgressPrimitive.Root>, ProgressProps>(
  ({ className, value, ...props }, ref) => {
    const indeterminate = value === null || value === undefined;
    const clamped = indeterminate ? 0 : Math.min(100, Math.max(0, value));
    return (
      <ProgressPrimitive.Root
        ref={ref}
        className={cn('relative h-2 w-full overflow-hidden rounded-full bg-muted', className)}
        value={indeterminate ? null : clamped}
        {...props}
      >
        <ProgressPrimitive.Indicator
          className={cn('h-full w-full flex-1 bg-brand transition-transform', indeterminate && 'animate-pulse')}
          style={{ transform: indeterminate ? undefined : `translateX(-${100 - clamped}%)` }}
        />
      </ProgressPrimitive.Root>
    );
  },
);

Progress.displayName = ProgressPrimitive.Root.displayName;

export { Progress };
