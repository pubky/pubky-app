'use client';

import * as Atoms from '@/atoms';
import { ArrowLeft, Loader2, ArrowRight } from 'lucide-react';
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
    <Atoms.Container className={cn('flex-row justify-between gap-3 py-6 lg:gap-6', className)}>
      {!hiddenBackButton && (
        <Atoms.Button
          size="lg"
          className="rounded-full"
          variant={'secondary'}
          onClick={onHandleBackButton}
          disabled={backButtonDisabled}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          {backText}
        </Atoms.Button>
      )}
      {!hiddenContinueButton && (
        <Atoms.Button
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
        </Atoms.Button>
      )}
    </Atoms.Container>
  );
};
