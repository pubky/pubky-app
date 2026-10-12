'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AUTH_ROUTES } from '@/app/routes';
import { AuthController } from '@/controllers/auth/auth';
import { isAuthFlowCanceledError } from '@/libs/error/auth-flow-canceled';
import { Logger } from '@/libs/logger/logger';
import { toast } from '@/molecules/Toaster/toast';
import { useOnboardingStore } from '@/stores/onboarding/onboarding.store';
import type { UseSignOutResult } from './useSignOut.types';

export function useSignOut(): UseSignOutResult {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const handleSignOut = async () => {
    setIsLoading(true);
    try {
      if (useOnboardingStore.getState().secretKey) {
        router.push(AUTH_ROUTES.LOGOUT);
        return;
      }
      await AuthController.logout();
      router.push(AUTH_ROUTES.LOGOUT);
    } catch (error) {
      if (isAuthFlowCanceledError(error)) {
        setIsLoading(false);
        return;
      }
      Logger.error('Failed to sign out:', { error });
      toast({ variant: 'error', description: 'Could not sign out. Try again.' });
      setIsLoading(false);
    }
  };

  return {
    handleSignOut,
    isLoading,
  };
}
