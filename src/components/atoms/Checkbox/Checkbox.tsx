'use client';

import * as React from 'react';
import { Checkbox as CheckboxPrimitive } from 'radix-ui';
import { Container } from '../Container/Container';
import { Label } from '../Label/Label';
import { Typography } from '../Typography/Typography';

import type { CheckboxProps } from './Checkbox.types';
import { Check } from 'lucide-react';
import { cn } from '@/libs/utils/utils';
const Checkbox = React.forwardRef<React.ComponentRef<typeof CheckboxPrimitive.Root>, CheckboxProps>(
  ({ className, label, description, id, ...props }, ref) => {
    const generatedId = React.useId();
    const checkboxId = id || generatedId;
    const checkboxElement = (
      <CheckboxPrimitive.Root
        ref={ref}
        id={checkboxId}
        className={cn(
          'peer h-4 w-4 shrink-0 rounded',
          'border border-input bg-white/5 shadow-sm',
          'transition-colors',
          'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'data-[state=checked]:border-brand data-[state=checked]:bg-brand',
          className,
        )}
        {...props}
      >
        <CheckboxPrimitive.Indicator className="flex items-center justify-center">
          <Check className="h-3.5 w-3.5 text-background" strokeWidth={3} />
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>
    );
    if (!label && !description) {
      return checkboxElement;
    }
    return (
      <Container overrideDefaults className="flex items-start gap-2">
        {checkboxElement}
        {(label || description) && (
          <Container overrideDefaults className="flex flex-col gap-1.5">
            {label && (
              <Label
                htmlFor={checkboxId}
                className="cursor-pointer text-base leading-none font-medium text-foreground peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
              >
                {label}
              </Label>
            )}
            {description && (
              <Typography className="text-sm leading-normal text-muted-foreground">{description}</Typography>
            )}
          </Container>
        )}
      </Container>
    );
  },
);
Checkbox.displayName = CheckboxPrimitive.Root.displayName;
export { Checkbox };
