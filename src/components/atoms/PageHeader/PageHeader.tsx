import * as Atoms from '@/atoms';
import { cn } from '@/libs/utils/utils';

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
    <Atoms.Container
      className={cn('gap-3 pt-2 pb-6', className)}
      data-testid={dataTestId || 'container'}
      {...(props as React.ComponentProps<typeof Atoms.Container>)}
    >
      {children}
    </Atoms.Container>
  );
}
