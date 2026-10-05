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

/**
 * Landing hero actions. Primary row: "Join now" plus, when Passport is available, "Continue with
 * Google". Learn / Explore are secondary: on desktop they live in the navbar (`HeaderHome`), so
 * here they render only below `md` as an outline row under the primary actions.
 */
export function ActionButtons({
  className,
  onLearn,
  onCreateAccount,
  onExplore,
  onContinueWithGoogle,
  isContinueWithGooglePending = false,
  ...props
}: ActionButtonsProps) {
  const hasSecondaryActions = Boolean(onLearn || onExplore);

  return (
    <Container className={cn('gap-4', className)} {...props}>
      <Container className="flex-col gap-3 sm:flex-row sm:items-center">
        <Button
          id="create-account-btn"
          variant="brand"
          className="w-full px-10 sm:w-auto"
          size="lg"
          onClick={onCreateAccount}
        >
          <UserRoundPlus className="h-4 w-4" />
          {'Join now'}
        </Button>
        {onContinueWithGoogle && (
          <ContinueWithPassport
            onContinue={onContinueWithGoogle}
            isPending={isContinueWithGooglePending}
            className="w-full sm:w-auto"
          />
        )}
      </Container>
      {hasSecondaryActions && (
        <Container className="flex-row gap-3 md:hidden" data-testid="action-buttons-secondary">
          {onLearn && (
            <Button
              id="learn-btn"
              data-cy="learn-btn"
              variant="outline"
              className="flex-1 gap-2 backdrop-blur-sm"
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
              variant="outline"
              className="flex-1 gap-2 backdrop-blur-sm"
              onClick={onExplore}
            >
              <Eye className="h-4 w-4" />
              {'Explore'}
            </Button>
          )}
        </Container>
      )}
    </Container>
  );
}
