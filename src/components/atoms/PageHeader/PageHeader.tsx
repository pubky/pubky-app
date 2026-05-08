import { cn } from '@/libs/utils/utils';
import { Container } from '../Container/Container';

interface PageHeaderProps {
  children: React.ReactNode;
  className?: React.HTMLAttributes<HTMLDivElement>['className'];
  'data-testid'?: string;
}

export function PageHeader({
  children,
  className,
  'data-testid': dataTestId,
  ...props
}: PageHeaderProps & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <Container
      className={cn('gap-3 pt-2 pb-6', className)}
      data-testid={dataTestId || 'container'}
      {...(props as React.ComponentProps<typeof Container>)}
    >
      {children}
    </Container>
  );
}
