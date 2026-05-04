import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';

import type { ButtonsNavigationProps } from './ButtonsNavigation.types';
import { ArrowLeft, Loader2, ArrowRight } from 'lucide-react';
import { cn } from '@/libs/utils/utils';
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
}: ButtonsNavigationProps) {
  return (
    <Container className={cn('justify-between gap-3 py-6 md:flex-row lg:gap-6', className)}>
      {!hiddenBackButton && (
        <Button
          id={`${id}-back-btn`}
          size="lg"
          className={cn('rounded-full', backButtonClassName)}
          variant={'secondary'}
          onClick={onHandleBackButton}
          disabled={backButtonDisabled}
        >
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          {backText}
        </Button>
      )}
      {!hiddenContinueButton && (
        <Button
          id={`${id}-continue-btn`}
          size="lg"
          className={cn('rounded-full', continueButtonClassName)}
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
        </Button>
      )}
    </Container>
  );
}
