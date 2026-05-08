'use client';
import { ArrowLeft, ArrowRight, Loader2 } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { cn } from '@/libs/utils/utils';

export const ProfileNavigation = ({
  continueButtonDisabled,
  continueText = 'Finish',
  onContinue,
  className,
  onHandleBackButton,
  backText = 'Back',
  backButtonDisabled,
  hiddenBackButton,
  hiddenContinueButton,
  continueButtonLoading,
}: {
  continueButtonDisabled: boolean;
  continueText: string;
  onContinue: () => void;
  className?: React.HTMLAttributes<HTMLDivElement>['className'];
  onHandleBackButton?: () => void;
  backText?: string;
  backButtonDisabled?: boolean;
  hiddenBackButton?: boolean;
  hiddenContinueButton?: boolean;
  continueButtonLoading?: boolean;
}) => {
  const onHandleContinueButton = () => {
    onContinue();
  };
  return (
    <Container className={cn('flex-row justify-between gap-3 py-6 lg:gap-6', className)}>
      {!hiddenBackButton && (
        <Button
          size="lg"
          className="rounded-full"
          variant={'secondary'}
          onClick={onHandleBackButton}
          disabled={backButtonDisabled}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          {backText}
        </Button>
      )}
      {!hiddenContinueButton && (
        <Button
          id="profile-finish-btn"
          size="lg"
          className={cn('w-full rounded-full sm:w-auto')}
          onClick={onHandleContinueButton}
          disabled={continueButtonDisabled}
        >
          {continueButtonLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {continueText}
            </>
          ) : (
            <>
              <ArrowRight className="mr-2 h-4 w-4" />
              {continueText}
            </>
          )}
        </Button>
      )}
    </Container>
  );
};
