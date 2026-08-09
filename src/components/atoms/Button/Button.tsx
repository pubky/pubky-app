'use client';

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import { cn } from '@/libs/utils/utils';

export enum ButtonVariant {
  DEFAULT = 'default',
  DESTRUCTIVE = 'destructive',
  OUTLINE = 'outline',
  SECONDARY = 'secondary',
  GHOST = 'ghost',
  BRAND = 'brand',
  LINK = 'link',
}

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*="size-"])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 aria-invalid:ring-destructive/40 aria-invalid:border-destructive font-semibold cursor-pointer rounded-full border shadow-xs',
  {
    variants: {
      variant: {
        default: 'bg-brand/16 text-brand hover:!bg-brand/30 border-brand',
        destructive:
          'bg-destructive/60 text-destructive-foreground hover:bg-destructive/90 focus-visible:ring-destructive/20 focus-visible:ring-destructive/40',
        'destructive-soft': 'bg-destructive/16 text-destructive hover:!bg-destructive/30 border-destructive',
        outline:
          'bg-background hover:bg-accent hover:text-accent-foreground bg-input/30 border-input hover:bg-input/50',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-accent',
        ghost: 'hover:bg-accent hover:text-accent-foreground hover:bg-accent/50 border-none',
        brand: 'bg-brand text-background border-brand hover:bg-brand/90',
        link: 'text-primary underline-offset-4 hover:underline',
        dark: 'bg-neutral-900 text-white hover:bg-neutral-800 border-neutral-900 hover:border-neutral-800',
        'dark-outline':
          'bg-transparent hover:bg-neutral-900 hover:text-white bg-transparent border-neutral-700 hover:bg-neutral-800',
      },
      size: {
        default: 'h-10 gap-1 px-4 py-2 has-[>svg]:px-4',
        sm: 'h-8 gap-1.5 px-3 has-[>svg]:px-3.5',
        icon: 'size-9',
        lg: 'h-auto gap-2 px-8 py-5 text-sm font-bold leading-normal',
      },
    },
    defaultVariants: {
      variant: ButtonVariant.DEFAULT,
      size: 'default',
    },
  },
);

const Button = React.forwardRef<
  React.ComponentRef<'button'>,
  React.ComponentProps<'button'> &
    VariantProps<typeof buttonVariants> & {
      asChild?: boolean;
      overrideDefaults?: boolean;
    }
>(({ className, variant, size, asChild = false, overrideDefaults = false, ...props }, ref) => {
  const Comp = asChild ? Slot.Root : 'button';

  return (
    <Comp
      ref={ref}
      className={overrideDefaults ? className : cn(buttonVariants({ variant, size }), className)}
      data-slot="button"
      data-variant={variant}
      data-size={size}
      {...props}
    />
  );
});
Button.displayName = 'Button';

export { Button, buttonVariants };
