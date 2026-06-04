'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { LogIn } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { AUTH_ROUTES } from '@/app/routes';
import { Button } from '@/atoms/Button/Button';

export function HeaderButtonSignIn({ ...props }: React.HTMLAttributes<HTMLButtonElement>) {
  const t = useTranslations('header');
  const router = useRouter();
  const handleSignIn = () => {
    router.push(AUTH_ROUTES.SIGN_IN);
  };
  return (
    <Button
      id="header-sign-in-btn"
      data-testid="header-sign-in-btn"
      data-cy="header-sign-in-btn"
      variant="secondary"
      onClick={handleSignIn}
      className="gap-2"
      {...props}
    >
      <LogIn className="size-4" />
      {t('signIn')}
    </Button>
  );
}
