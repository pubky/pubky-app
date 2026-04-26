import { ReactNode } from 'react';
import { cn } from '@/libs/utils/utils';

interface TypographyProps {
  as?:
    | 'h1'
    | 'h2'
    | 'h3'
    | 'h4'
    | 'h5'
    | 'h6'
    | 'p'
    | 'span'
    | 'i'
    | 'b'
    | 'strong'
    | 'em'
    | 'small'
    | 'sub'
    | 'sup'
    | 'code'
    | 'pre'
    | 'blockquote'
    | 'label';
  htmlFor?: string;
  children: ReactNode;
  className?: React.HTMLAttributes<HTMLElement>['className'];
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  overrideDefaults?: boolean;
  'data-testid'?: string;
}

export function Typography({
  as: Tag = 'p',
  children,
  className,
  size = 'md',
  overrideDefaults = false,
  'data-testid': dataTestId,
  ...props
}: TypographyProps & React.HTMLAttributes<HTMLElement>) {
  const sizeClasses = {
    xs: 'text-xs font-medium',
    sm: 'text-sm font-medium',
    md: 'text-base font-medium',
    lg: 'text-2xl font-bold',
    xl: 'text-4xl font-bold',
    '2xl': 'text-6xl font-bold',
  };

  const typographyClassName = overrideDefaults ? className : cn(sizeClasses[size], 'text-foreground', className);

  return (
    <Tag data-testid={dataTestId || 'typography'} {...props} className={typographyClassName}>
      {children}
    </Tag>
  );
}
