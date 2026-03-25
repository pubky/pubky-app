export interface ButtonsNavigationProps {
  id: string;
  className?: React.HTMLAttributes<HTMLDivElement>['className'];
  onHandleBackButton?: () => void;
  onHandleContinueButton?: () => void;
  backText?: string;
  continueText?: string;
  backButtonDisabled?: boolean;
  continueButtonDisabled?: boolean;
  hiddenContinueButton?: boolean;
  hiddenBackButton?: boolean;
  loadingContinueButton?: boolean;
  backButtonClassName?: React.HTMLAttributes<HTMLButtonElement>['className'];
  continueButtonClassName?: React.HTMLAttributes<HTMLButtonElement>['className'];
}
