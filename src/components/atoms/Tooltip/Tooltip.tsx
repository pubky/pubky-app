'use client';

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Tooltip as TooltipPrimitive } from 'radix-ui';
import { cn } from '@/libs/utils/utils';

const TooltipProvider = TooltipPrimitive.Provider;

const Tooltip = TooltipPrimitive.Root;

const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipPortal = TooltipPrimitive.Portal;

const tooltipContentVariants = cva(
  [
    'z-50 max-w-sm rounded-md px-3 py-1.5 text-xs leading-4',
    'data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
    'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
    'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
  ],
  {
    variants: {
      variant: {
        default: 'bg-primary font-normal text-primary-foreground',
        // Accent bubble for action hints and inline previews; `[&_svg]:fill-accent` recolours the arrow too.
        accent: 'bg-accent font-medium text-foreground [&_svg]:fill-accent',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

const TooltipContent = React.forwardRef<
  React.ComponentRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content> & VariantProps<typeof tooltipContentVariants>
>(({ className, variant, sideOffset = 4, children, ...props }, ref) => (
  <TooltipPrimitive.Content
    ref={ref}
    data-slot="tooltip-content"
    sideOffset={sideOffset}
    className={cn(tooltipContentVariants({ variant }), className)}
    {...props}
  >
    {children}
    <TooltipPrimitive.Arrow className="fill-primary" height={6} width={12} />
  </TooltipPrimitive.Content>
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

export { Tooltip, TooltipContent, tooltipContentVariants, TooltipPortal, TooltipProvider, TooltipTrigger };
