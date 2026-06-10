'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AUTH_ROUTES } from '@/app/routes';
import { AuthController } from '@/controllers/auth/auth';
import { ProfileController } from '@/controllers/profile/profile';
import { Logger } from '@/libs/logger/logger';
import { useToast } from '@/molecules/Toaster/use-toast';
import { useAuthStore } from '@/stores/auth/auth.store';
import type { UseDeleteAccountResult } from './useDeleteAccount.types';

/**
 * Hook to handle account deletion.
 *
 * Deletes all user data from the homeserver (with progress reporting),
 * then signs the user out and redirects to the logout page.
 * On failure, shows an error toast and resets state so the user can retry.
 */
export function useDeleteAccount(): UseDeleteAccountResult {
  const router = useRouter();
  const { toast } = useToast();
  const tCommon = useTranslations('common');
  const tErrors = useTranslations('errors');
  const [isDeleting, setIsDeleting] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleDeleteAccount = async () => {
    if (isDeleting) {
      Logger.warn('[useDeleteAccount] Deletion already in progress, ignoring request');
      return;
    }

    setIsDeleting(true);
    setProgress(0);

    try {
      const pubky = useAuthStore.getState().selectCurrentUserPubky();
      await ProfileController.commitDelete({ pubky, setProgress });
      await AuthController.logout();
      router.push(AUTH_ROUTES.LOGOUT);
    } catch (error) {
      Logger.error('Failed to delete account:', { error });
      toast({
        title: tCommon('error'),
        description: tErrors('deleteAccountFailed'),
        className: 'destructive border-destructive bg-destructive text-destructive-foreground',
      });
      setIsDeleting(false);
      setProgress(0);
    }
  };

  return {
    handleDeleteAccount,
    isDeleting,
    progress,
  };
}
