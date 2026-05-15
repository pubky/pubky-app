'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AUTH_ROUTES } from '@/app/routes';
import { AuthController } from '@/controllers/auth/auth';
import { Logger } from '@/libs/logger/logger';
import { useToast } from '@/molecules/Toaster/use-toast';
import type { UseSignOutResult } from './useSignOut.types';

export function useSignOut(): UseSignOutResult {
  const router = useRouter();
  const { toast } = useToast();
  const tCommon = useTranslations('common');
  const tErrors = useTranslations('errors');
  const [isLoading, setIsLoading] = useState(false);

  const showErrorToast = (description: string) => {
    toast({
      title: tCommon('error'),
      description,
      className: 'destructive border-destructive bg-destructive text-destructive-foreground',
    });
  };

  const handleSignOut = async () => {
    setIsLoading(true);
    try {
      await AuthController.logout();
      router.push(AUTH_ROUTES.LOGOUT);
    } catch (error) {
      Logger.error('Failed to sign out:', { error });
      showErrorToast(tErrors('signOutFailed'));
      setIsLoading(false);
    }
  };

  return {
    handleSignOut,
    isLoading,
  };
}
