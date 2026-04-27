'use client';

import { useTranslations } from 'next-intl';
import * as Atoms from '@/atoms';
import * as Libs from '@/libs';
import { LogIn, UserRoundPlus } from 'lucide-react';
interface ActionButtonsProps {
  className?: React.HTMLAttributes<HTMLDivElement>['className'];
  onSignIn?: () => void;
  onCreateAccount?: () => void;
}

export function ActionButtons({ className, onSignIn, onCreateAccount, ...props }: ActionButtonsProps) {
  const t = useTranslations('landing');

  return (
    <Atoms.Container className={Libs.cn('gap-3 sm:flex-row sm:items-center', className)} {...props}>
      <Atoms.Button
        id="sign-in-btn"
        variant="secondary"
        className="w-full flex-1 sm:w-auto"
        size="lg"
        onClick={onSignIn}
      >
        <LogIn className="mr-2 h-4 w-4" />
        {t('signIn')}
      </Atoms.Button>
      <Atoms.Button id="create-account-btn" className="w-full flex-1 sm:w-auto" size="lg" onClick={onCreateAccount}>
        <UserRoundPlus className="mr-2 h-4 w-4" />
        {t('joinNow')}
      </Atoms.Button>
    </Atoms.Container>
  );
}
