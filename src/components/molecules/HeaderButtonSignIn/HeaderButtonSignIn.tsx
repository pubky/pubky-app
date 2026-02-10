'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import * as React from 'react';
import * as Atoms from '@/atoms';
import * as Libs from '@/libs';
import * as App from '@/app';

export function HeaderButtonSignIn({ ...props }: React.HTMLAttributes<HTMLButtonElement>) {
  const t = useTranslations('header');
  const router = useRouter();

  const handleSignIn = () => {
    router.push(App.AUTH_ROUTES.SIGN_IN);
  };

  return (
    <Atoms.Button
      id="header-sign-in-btn"
      data-testid="header-sign-in-btn"
      variant="secondary"
      onClick={handleSignIn}
      className="gap-2"
      {...props}
    >
      <Libs.UserRoundPlus className="size-4" />
      {t('newHere')}
    </Atoms.Button>
  );
}
