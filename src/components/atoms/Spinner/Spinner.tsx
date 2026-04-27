'use client';

import * as React from 'react';
import * as Atoms from '@/atoms';
import { cn } from '@/libs/utils/utils';

export interface SpinnerProps extends React.ComponentProps<typeof Atoms.Container> {
  size?: 'sm' | 'md' | 'lg';
}

const sizeClasses = {
  sm: 'h-4 w-4',
  md: 'h-8 w-8',
  lg: 'h-12 w-12',
};

export const Spinner = React.forwardRef<HTMLDivElement, SpinnerProps>(
  ({ className, size = 'md', overrideDefaults = true, ...props }, ref) => {
    return (
      <Atoms.Container
        ref={ref}
        overrideDefaults={overrideDefaults}
        className={cn('animate-spin rounded-full border-b-2 border-brand', sizeClasses[size], className)}
        data-testid="spinner"
        role="status"
        aria-label="Loading"
        {...props}
      />
    );
  },
);

Spinner.displayName = 'Spinner';
