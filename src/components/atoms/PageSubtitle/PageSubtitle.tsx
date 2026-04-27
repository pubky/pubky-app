import { ReactNode } from 'react';
import { cn } from '@/libs/utils/utils';

interface PageSubtitleProps extends React.HTMLAttributes<HTMLHeadingElement> {
  children?: ReactNode;
  as?: 'h2' | 'h5' | 'p';
  title?: string;
}

export function PageSubtitle({ as: Component = 'h2', className, children, title, ...props }: PageSubtitleProps) {
  return (
    <Component
      className={cn('text-xl leading-normal font-light text-muted-foreground lg:text-2xl', className)}
      {...props}
    >
      {title || children}
    </Component>
  );
}
