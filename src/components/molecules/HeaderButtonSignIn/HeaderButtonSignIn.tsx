'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { Button } from '@/atoms/Button/Button';

import { ONBOARDING_ROUTES } from '@/app/routes';
import { UserRoundPlus } from 'lucide-react';
export function HeaderButtonSignIn({ ...props }: React.HTMLAttributes<HTMLButtonElement>) {
  const t = useTranslations('header');
  const router = useRouter();
  const handleNewHere = () => {
    router.push(ONBOARDING_ROUTES.HUMAN);
  };
  return (
    <Button
      id="header-sign-in-btn"
      data-testid="header-sign-in-btn"
      variant="secondary"
      onClick={handleNewHere}
      className="gap-2"
      {...props}
    >
      <UserRoundPlus className="size-4" />
      {t('newHere')}
    </Button>
  );
}
