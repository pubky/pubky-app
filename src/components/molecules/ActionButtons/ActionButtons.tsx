import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';

import { LogIn, UserRoundPlus } from 'lucide-react';
import { cn } from '@/libs/utils/utils';
interface ActionButtonsProps {
  className?: React.HTMLAttributes<HTMLDivElement>['className'];
  onSignIn?: () => void;
  onCreateAccount?: () => void;
  signInText?: string;
  createAccountText?: string;
}
export function ActionButtons({
  className,
  onSignIn,
  onCreateAccount,
  signInText = 'Sign in',
  createAccountText = 'Create account',
  ...props
}: ActionButtonsProps) {
  return (
    <Container className={cn('flex-row gap-3 sm:items-center', className)} {...props}>
      <Button id="sign-in-btn" variant="secondary" className="w-[158px] sm:w-auto" size="lg" onClick={onSignIn}>
        <LogIn className="mr-2 h-4 w-4" />
        {signInText}
      </Button>
      <Button id="create-account-btn" className="w-[158px] sm:w-auto" size="lg" onClick={onCreateAccount}>
        <UserRoundPlus className="mr-2 h-4 w-4" />
        {createAccountText}
      </Button>
    </Container>
  );
}
