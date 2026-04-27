import * as Atoms from '@/atoms';
import * as Libs from '@/libs';
import * as Types from './ButtonsNavigation.types';
import { ArrowLeft, Loader2, ArrowRight } from 'lucide-react';
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
    <Atoms.Container className={Libs.cn('justify-between gap-3 py-6 md:flex-row lg:gap-6', className)}>
      {!hiddenBackButton && (
        <Atoms.Button
          id={`${id}-back-btn`}
          size="lg"
          className={Libs.cn('rounded-full', backButtonClassName)}
          variant={'secondary'}
          onClick={onHandleBackButton}
          disabled={backButtonDisabled}
        >
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          {backText}
        </Atoms.Button>
      )}
      {!hiddenContinueButton && (
        <Atoms.Button
          id={`${id}-continue-btn`}
          size="lg"
          className={Libs.cn('rounded-full', continueButtonClassName)}
          onClick={onHandleContinueButton}
          disabled={loadingContinueButton || continueButtonDisabled}
        >
          {loadingContinueButton ? (
            <>
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              {continueText}
            </>
          ) : (
            <>
              <ArrowRight className="mr-1.5 h-4 w-4" />
              {continueText}
            </>
          )}
        </Atoms.Button>
      )}
    </Atoms.Container>
  );
}
