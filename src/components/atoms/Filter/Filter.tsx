'use client';

import * as React from 'react';
import { cn } from '@/libs/utils/utils';
import { Button } from '../Button/Button';
import { Container } from '../Container/Container';
import { Heading } from '../Heading/Heading';
import { Typography } from '../Typography/Typography';

function FilterRoot({ className, children, ...props }: React.HTMLAttributes<HTMLElement>) {
  return (
    <Container
      data-slot="filter-root"
      data-testid="filter-root"
      className={cn('m-0 min-w-0 gap-2 bg-background p-0', className)}
      {...props}
    >
      {children}
    </Container>
  );
}

function FilterHeader({
  title,
  subtitle,
  className,
  ...props
}: {
  title: string;
  subtitle?: string;
  className?: string;
} & React.HTMLAttributes<HTMLElement>) {
  return (
    <Container
      overrideDefaults
      data-slot="filter-header"
      data-testid="filter-header"
      className="m-0 gap-2 p-0"
      {...props}
    >
      <Heading level={2} size="lg" className={cn('font-light text-muted-foreground', className)}>
        {title}
      </Heading>
      {subtitle && (
        <Typography size="md" className="text-base leading-normal font-medium text-secondary-foreground">
          {subtitle}
        </Typography>
      )}
    </Container>
  );
}

function FilterList({ className, children, ...props }: React.HTMLAttributes<HTMLElement>) {
  return (
    <Container data-slot="filter-list" data-testid="filter-list" className={className} {...props}>
      {children}
    </Container>
  );
}

function FilterItem({
  isSelected = false,
  onClick,
  className,
  children,
  ...props
}: {
  isSelected?: boolean;
  onClick?: () => void;
  className?: string;
  children: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <Button
      type="button"
      data-slot="filter-item"
      data-testid="filter-item"
      data-selected={isSelected ? 'true' : 'false'}
      aria-pressed={isSelected}
      overrideDefaults
      className={cn(
        'flex cursor-pointer gap-2 text-base font-medium transition-colors',
        'border-0 bg-transparent p-0 text-left',
        'items-center justify-normal',
        isSelected ? 'text-foreground' : 'text-muted-foreground hover:text-foreground/80',
        'm-0 h-full px-0 py-1',
        className,
      )}
      onClick={onClick}
      {...props}
    >
      {children}
    </Button>
  );
}

function FilterItemIcon({
  icon: Icon,
  className,
  ...props
}: {
  icon: React.ComponentType<{ className?: string }>;
  className?: string;
} & Omit<React.HTMLAttributes<HTMLDivElement>, 'onCopy' | 'onCut' | 'onPaste'>) {
  return <Icon className={cn('h-5 w-5', className)} {...props} />;
}

function FilterItemLabel({
  children,
  className,
  ...props
}: {
  children: React.ReactNode;
  className?: string;
} & React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={cn('', className)} {...props}>
      {children}
    </span>
  );
}

export { FilterHeader, FilterItem, FilterItemIcon, FilterItemLabel, FilterList, FilterRoot };
