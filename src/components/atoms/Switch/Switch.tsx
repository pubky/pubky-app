'use client';

import * as React from 'react';
import { Switch as SwitchPrimitives } from 'radix-ui';
import { cn } from '@/libs/utils/utils';
import type { SwitchProps } from './Switch.types';

const Switch = React.forwardRef<React.ComponentRef<typeof SwitchPrimitives.Root>, SwitchProps>(
  ({ className, ...props }, ref) => (
    <SwitchPrimitives.Root
      className={cn(
        'peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent px-0.5 transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
        'bg-muted data-[state=checked]:bg-brand',
        className,
      )}
      {...props}
      ref={ref}
    >
      <SwitchPrimitives.Thumb
        className={cn(
          'pointer-events-none block size-4 rounded-full bg-background shadow-sm ring-0 transition-transform data-[state=checked]:translate-x-3 data-[state=unchecked]:translate-x-0',
        )}
      />
    </SwitchPrimitives.Root>
  ),
);

Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
