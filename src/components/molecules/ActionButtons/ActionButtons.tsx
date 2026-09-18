'use client';

import { BookOpen, Eye, UserRoundPlus } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { cn } from '@/libs/utils/utils';
import { ContinueWithPassport } from '../ContinueWithPassport/ContinueWithPassport';

interface ActionButtonsProps {
  className?: React.HTMLAttributes<HTMLDivElement>['className'];
  onLearn?: () => void;
  onCreateAccount?: () => void;
  onExplore?: () => void;
  /** Pubky Passport entry ("Continue with Google"); rendered only when provided. */
  onContinueWithGoogle?: () => void;
  isContinueWithGooglePending?: boolean;
}

export function ActionButtons({
  className,
  onLearn,
  onCreateAccount,
  onExplore,
  onContinueWithGoogle,
  isContinueWithGooglePending = false,
  ...props
}: ActionButtonsProps) {
  const hasBothSecondaryActions = Boolean(onLearn && onExplore);
  const secondaryActionClassName = cn('w-full sm:w-auto', !hasBothSecondaryActions && 'col-span-2 sm:col-span-1');

  return (
    <Container
      display="grid"
      className={cn('grid-cols-2 gap-3 sm:flex sm:flex-row sm:items-center', className)}
      {...props}
    >
      {onLearn && (
        <Button
          id="learn-btn"
          data-cy="learn-btn"
          variant="secondary"
          className={secondaryActionClassName}
          size="lg"
          onClick={onLearn}
        >
          <BookOpen className="h-4 w-4" />
          {'Learn'}
        </Button>
      )}
      {onExplore && (
        <Button
          id="explore-btn"
          data-cy="explore-btn"
          variant="secondary"
          className={secondaryActionClassName}
          size="lg"
          onClick={onExplore}
        >
          <Eye className="h-4 w-4" />
          {'Explore'}
        </Button>
      )}
      <Button
        id="create-account-btn"
        variant="brand"
        className="order-first col-span-2 w-full px-10 sm:order-none sm:col-span-1 sm:w-auto"
        size="lg"
        onClick={onCreateAccount}
      >
        <UserRoundPlus className="h-4 w-4" />
        {'Join'}
      </Button>
      {onContinueWithGoogle && (
        <ContinueWithPassport
          onContinue={onContinueWithGoogle}
          isPending={isContinueWithGooglePending}
          className="order-first col-span-2 w-full sm:order-none sm:col-span-1 sm:w-auto"
        />
      )}
    </Container>
  );
}
