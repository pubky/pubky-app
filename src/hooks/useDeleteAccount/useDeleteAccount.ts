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

interface UseDeleteAccountResult {
  handleDeleteAccount: () => Promise<void>;
  isDeleting: boolean;
  progress: number;
}

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
    } catch (error) {
      Logger.error('Failed to delete account:', { error });
      toast({
        title: tCommon('error'),
        description: tErrors('deleteAccountFailed'),
        className: 'destructive border-destructive bg-destructive text-destructive-foreground',
      });
      setIsDeleting(false);
      setProgress(0);
      return;
    }

    // Past this point the account data is permanently gone, so a logout failure
    // must not surface as a retryable deletion error. Log it and redirect anyway;
    // the next sign-in re-runs local cleanup.
    try {
      await AuthController.logout();
    } catch (error) {
      Logger.warn('[useDeleteAccount] Logout failed after account deletion, redirecting anyway', { error });
    }

    router.push(AUTH_ROUTES.LOGOUT);
  };

  return {
    handleDeleteAccount,
    isDeleting,
    progress,
  };
}
