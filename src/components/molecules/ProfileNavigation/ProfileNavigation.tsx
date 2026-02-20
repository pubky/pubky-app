'use client';

import * as Atoms from '@/atoms';
import * as Libs from '@/libs';

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
    <Atoms.Container className={Libs.cn('flex-row justify-between gap-3 py-6 lg:gap-6', className)}>
      {!hiddenBackButton && (
        <Atoms.Button
          size="lg"
          className="w-full flex-1 rounded-full md:flex-0"
          variant={'secondary'}
          onClick={onHandleBackButton}
          disabled={backButtonDisabled}
        >
          <Libs.ArrowLeft className="mr-2 h-4 w-4" />
          {backText}
        </Atoms.Button>
      )}
      {!hiddenContinueButton && (
        <Atoms.Button
          id="profile-finish-btn"
          size="lg"
          className={Libs.cn('w-full flex-1 rounded-full md:flex-0', hiddenBackButton && 'ml-auto w-auto flex-none')}
          onClick={onHandleContinueButton}
          disabled={continueButtonDisabled}
        >
          {continueButtonLoading ? (
            <>
              <Libs.Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {continueText}
            </>
          ) : (
            <>
              <Libs.ArrowRight className="mr-2 h-4 w-4" />
              {continueText}
            </>
          )}
        </Atoms.Button>
      )}
    </Atoms.Container>
  );
};
