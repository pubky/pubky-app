'use client';

import * as React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { LogIn, UserRoundPlus } from 'lucide-react';
import { AUTH_ROUTES, ONBOARDING_ROUTES } from '@/app/routes';
import { Button } from '@/atoms/Button/Button';

export function HeaderButtonSignIn({ ...props }: React.HTMLAttributes<HTMLButtonElement>) {
  const router = useRouter();
  const pathname = usePathname();
  const isSignInPage = pathname === AUTH_ROUTES.SIGN_IN;

  const handleClick = () => {
    router.push(isSignInPage ? ONBOARDING_ROUTES.HUMAN : AUTH_ROUTES.SIGN_IN);
  };

  return (
    <Button
      id="header-sign-in-btn"
      data-testid="header-sign-in-btn"
      data-cy="header-sign-in-btn"
      variant="secondary"
      onClick={handleClick}
      className="gap-2"
      {...props}
    >
      {isSignInPage ? (
        <>
          <UserRoundPlus className="size-4" />
          {'New here?'}
        </>
      ) : (
        <>
          <LogIn className="size-4" />
          {'Sign in'}
        </>
      )}
    </Button>
  );
}
