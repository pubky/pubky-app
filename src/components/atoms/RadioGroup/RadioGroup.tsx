'use client';

import * as React from 'react';
import { RadioGroup as RadioGroupPrimitive } from 'radix-ui';
import { cn } from '@/libs/utils/utils';
import { Container } from '../Container/Container';
import { Label } from '../Label/Label';
import { Typography } from '../Typography/Typography';

type RadioGroupProps = React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Root>;

interface RadioGroupItemProps extends React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item> {
  /** Optional label text displayed next to the radio */
  label?: string;
  /** Optional description text displayed below the label */
  description?: string;
  /** Visual variant: 'default' is a plain radio + label; 'box' wraps the item in a bordered card */
  variant?: 'default' | 'box';
}

const RadioGroup = React.forwardRef<React.ComponentRef<typeof RadioGroupPrimitive.Root>, RadioGroupProps>(
  ({ className, ...props }, ref) => {
    return <RadioGroupPrimitive.Root ref={ref} className={cn('grid gap-3', className)} {...props} />;
  },
);
RadioGroup.displayName = RadioGroupPrimitive.Root.displayName;

const RadioGroupItem = React.forwardRef<React.ComponentRef<typeof RadioGroupPrimitive.Item>, RadioGroupItemProps>(
  ({ className, label, description, id, variant = 'default', ...props }, ref) => {
    const generatedId = React.useId();
    const itemId = id || generatedId;

    const radioElement = (
      <RadioGroupPrimitive.Item
        ref={ref}
        id={itemId}
        className={cn(
          'peer size-4 shrink-0 rounded-full',
          'border border-input bg-white/5 shadow-sm',
          'transition-colors',
          'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'data-[state=checked]:border-brand data-[state=checked]:bg-brand',
          className,
        )}
        {...props}
      >
        <RadioGroupPrimitive.Indicator className="flex items-center justify-center">
          <span className="block size-2 rounded-full bg-background" />
        </RadioGroupPrimitive.Indicator>
      </RadioGroupPrimitive.Item>
    );

    if (!label && !description) {
      return radioElement;
    }

    const content = (
      <Container overrideDefaults className="flex items-start gap-2">
        {radioElement}
        <Container overrideDefaults className="flex flex-col gap-1.5">
          {label && (
            <Label
              htmlFor={itemId}
              className="cursor-pointer text-base leading-none font-medium text-foreground peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
            >
              {label}
            </Label>
          )}
          {description && (
            <Typography className="text-sm leading-normal text-muted-foreground">{description}</Typography>
          )}
        </Container>
      </Container>
    );

    if (variant === 'box') {
      return (
        <Container
          overrideDefaults
          className={cn(
            'rounded-lg border border-border p-4 transition-colors',
            'has-[[data-state=checked]]:border-brand',
            'has-[[data-disabled]]:cursor-not-allowed has-[[data-disabled]]:opacity-50',
          )}
        >
          {content}
        </Container>
      );
    }

    return content;
  },
);
RadioGroupItem.displayName = RadioGroupPrimitive.Item.displayName;

export { RadioGroup, RadioGroupItem };
