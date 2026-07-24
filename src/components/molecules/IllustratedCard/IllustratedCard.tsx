import { cva } from 'class-variance-authority';
import { Card, CardContent } from '@/atoms/Card/Card';
import { cn } from '@/libs/utils/utils';
import type { IllustratedCardProps } from './IllustratedCard.types';

const illustratedCardVariants = cva('gap-0 p-6', {
  variants: {
    paddingBreakpoint: {
      md: 'md:p-12',
      lg: 'lg:p-12',
    },
  },
  defaultVariants: {
    paddingBreakpoint: 'lg',
  },
});

const illustratedCardLayoutVariants = cva('flex w-full gap-4 lg:items-start lg:gap-12', {
  variants: {
    layout: {
      row: 'flex-col lg:flex-row',
      column: 'flex-col',
    },
  },
  defaultVariants: {
    layout: 'row',
  },
});

const illustratedCardVisualVariants = cva('', {
  variants: {
    visualSizing: {
      fixed: 'hidden w-48 shrink-0 flex-col lg:flex',
      intrinsic: 'contents',
    },
  },
  defaultVariants: {
    visualSizing: 'fixed',
  },
});

/**
 * Shared Shadcn card layout for onboarding surfaces with a fixed 192px
 * illustration by default and a flexible content column.
 */
export function IllustratedCard({
  children,
  visual,
  visualClassName,
  contentClassName,
  layout = 'row',
  paddingBreakpoint = 'lg',
  visualSizing = 'fixed',
  className,
  ...props
}: IllustratedCardProps) {
  return (
    <Card className={cn(illustratedCardVariants({ paddingBreakpoint }), className)} {...props}>
      <CardContent className={cn(illustratedCardLayoutVariants({ layout }), 'p-0')}>
        {visual && (
          <div
            data-slot="illustrated-card-visual"
            className={cn(illustratedCardVisualVariants({ visualSizing }), visualClassName)}
          >
            {visual}
          </div>
        )}
        <div
          data-slot="illustrated-card-content"
          className={cn('flex w-full max-w-xl min-w-0 flex-1 flex-col gap-6', contentClassName)}
        >
          {children}
        </div>
      </CardContent>
    </Card>
  );
}
