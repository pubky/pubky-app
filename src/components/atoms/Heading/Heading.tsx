import { ReactNode } from 'react';
import { cn } from '@/libs/utils/utils';

interface HeadingProps {
  level?: 1 | 2 | 3 | 4 | 5 | 6;
  children: ReactNode;
  className?: React.HTMLAttributes<HTMLElement>['className'];
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
}

export function Heading({ level = 1, children, className, size = 'md' }: HeadingProps) {
  const Tag = `h${level}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';

  const sizeClasses = {
    sm: 'text-lg font-semibold',
    md: 'text-xl font-semibold',
    lg: 'text-2xl font-bold',
    xl: 'text-4xl font-bold',
    '2xl': 'text-7xl sm:text-9xl font-bold',
  };

  return (
    <Tag data-testid={`heading-${level}`} className={cn(sizeClasses[size], 'text-foreground', className)}>
      {children}
    </Tag>
  );
}
