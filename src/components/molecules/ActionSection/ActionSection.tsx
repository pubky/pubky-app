import { ReactNode } from 'react';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { cn } from '@/libs/utils/utils';

interface ActionSectionProps {
  children?: ReactNode;
  className?: React.HTMLAttributes<HTMLDivElement>['className'];
  actions?: Array<{
    id?: string;
    label: string;
    icon?: ReactNode;
    onClick: () => void;
    variant?: 'default' | 'secondary' | 'outline' | 'ghost' | 'brand';
    disabled?: boolean;
    className?: React.HTMLAttributes<HTMLButtonElement>['className'];
  }>;
}

export function ActionSection({ children, className, actions = [] }: ActionSectionProps) {
  return (
    <Container className={cn('w-full flex-row gap-6', className)}>
      <Container className="w-full flex-col items-start justify-start gap-4">{children}</Container>
      {actions.length > 0 && (
        <Container className="flex-row gap-3">
          {actions.map((action, index) => (
            <Button
              id={action.id}
              key={index}
              variant={action.variant || 'secondary'}
              className={cn('rounded-full', action.className)}
              onClick={action.onClick}
              disabled={action.disabled}
            >
              {action.icon}
              {action.label}
            </Button>
          ))}
        </Container>
      )}
    </Container>
  );
}
