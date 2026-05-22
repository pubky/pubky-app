'use client';

import { LogIn, UserRoundPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { cn } from '@/libs/utils/utils';

interface ActionButtonsProps {
  className?: React.HTMLAttributes<HTMLDivElement>['className'];
  onSignIn?: () => void;
  onCreateAccount?: () => void;
}

export function ActionButtons({ className, onSignIn, onCreateAccount, ...props }: ActionButtonsProps) {
  const t = useTranslations('landing');

  return (
    <Container className={cn('flex-row gap-3 sm:items-center', className)} {...props}>
      <Button id="sign-in-btn" variant="secondary" className="w-full flex-1 sm:w-auto" size="lg" onClick={onSignIn}>
        <LogIn className="mr-2 h-4 w-4" />
        {t('signIn')}
      </Button>
      <Button id="create-account-btn" className="w-full flex-1 sm:w-auto" size="lg" onClick={onCreateAccount}>
        <UserRoundPlus className="mr-2 h-4 w-4" />
        {t('joinNow')}
      </Button>
    </Container>
  );
}
