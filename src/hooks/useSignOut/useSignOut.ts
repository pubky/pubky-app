'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as Molecules from '@/molecules';
import * as App from '@/app';
import type { UseSignOutResult } from './useSignOut.types';
import { Logger } from '@/libs/logger/logger';
import { AuthController } from '@/controllers/auth/auth';
export function useSignOut(): UseSignOutResult {
  const router = useRouter();
  const { toast } = Molecules.useToast();
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
      router.push(App.AUTH_ROUTES.LOGOUT);
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
