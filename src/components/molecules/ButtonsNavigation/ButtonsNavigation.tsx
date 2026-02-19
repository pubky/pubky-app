import * as Atoms from '@/atoms';
import * as Libs from '@/libs';
import * as Types from './ButtonsNavigation.types';

export function ButtonsNavigation({
  id,
  className,
  onHandleBackButton,
  onHandleContinueButton,
  backText = 'Back',
  continueText = 'Continue',
  backButtonDisabled = false,
  continueButtonDisabled = false,
  hiddenBackButton = false,
  hiddenContinueButton = false,
  loadingContinueButton = false,
  backButtonClassName,
  continueButtonClassName,
}: Types.ButtonsNavigationProps) {
  return (
    <Atoms.Container className={Libs.cn('gap-3 md:flex-row md:justify-between lg:gap-6', className)}>
      {!hiddenBackButton && (
        <Atoms.Button
          id={`${id}-back-btn`}
          size="lg"
          className={Libs.cn('w-full rounded-full md:w-auto md:flex-1', backButtonClassName)}
          variant={'secondary'}
          onClick={onHandleBackButton}
          disabled={backButtonDisabled}
        >
          <Libs.ArrowLeft className="mr-1.5 h-4 w-4" />
          {backText}
        </Atoms.Button>
      )}
      {!hiddenContinueButton && (
        <Atoms.Button
          id={`${id}-continue-btn`}
          size="lg"
          className={Libs.cn('w-full rounded-full md:w-auto md:flex-1', continueButtonClassName)}
          onClick={onHandleContinueButton}
          disabled={loadingContinueButton || continueButtonDisabled}
        >
          {loadingContinueButton ? (
            <>
              <Libs.Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              {continueText}
            </>
          ) : (
            <>
              <Libs.LogIn className="mr-1.5 h-4 w-4" />
              {continueText}
            </>
          )}
        </Atoms.Button>
      )}
    </Atoms.Container>
  );
}
