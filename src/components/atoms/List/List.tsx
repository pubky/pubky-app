import { ReactNode } from 'react';
import { cn } from '@/libs/utils/utils';

interface ListProps {
  as?: 'ul' | 'ol';
  children: ReactNode;
  className?: React.HTMLAttributes<HTMLElement>['className'];
  variant?: 'default' | 'decimal' | 'none';
  'data-testid'?: string;
}

export function List({
  as: Tag = 'ul',
  children,
  className,
  variant = 'default',
  'data-testid': dataTestId,
  ...props
}: ListProps & React.HTMLAttributes<HTMLElement>) {
  const variantClasses = {
    default: 'list-disc',
    decimal: 'list-decimal',
    none: 'list-none',
  };

  return (
    <Tag
      data-testid={dataTestId || 'list'}
      {...props}
      className={cn('ml-6 text-base font-normal text-muted-foreground', variantClasses[variant], className)}
    >
      {children}
    </Tag>
  );
}
