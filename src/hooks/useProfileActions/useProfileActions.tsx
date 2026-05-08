'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AUTH_ROUTES, SETTINGS_ROUTES } from '@/app/routes';
import { AuthController } from '@/controllers/auth/auth';
import { ProfileController } from '@/controllers/profile/profile';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard/useCopyToClipboard';
import { Logger } from '@/libs/logger/logger';
import { withPubkyPrefix } from '@/libs/utils/utils';
import { showErrorToast } from '@/molecules/Toaster/showErrorToast';
import { useAuthStore } from '@/stores/auth/auth.store';

export interface ProfileActions {
  onEdit: () => void;
  onCopyPublicKey: () => void;
  onCopyLink: () => void;
  onSignOut: () => void;
  onStatusChange: (status: string) => void;
  isLoggingOut: boolean;
}

export interface UseProfileActionsProps {
  publicKey: string;
  link: string;
}

/**
 * Hook for profile action handlers (navigation and side effects).
 * Pure action handlers - no data fetching or transformation.
 *
 * @param publicKey - The user's public key to copy (format: pubky...)
 * @param link - The profile link to copy
 * @returns Action handlers
 */
export function useProfileActions({ publicKey, link }: UseProfileActionsProps): ProfileActions {
  const router = useRouter();
  const { copyToClipboard } = useCopyToClipboard();
  const authStore = useAuthStore();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const tLogout = useTranslations('toast.logout');
  const tStatus = useTranslations('toast.status');

  const onEdit = useCallback(() => {
    router.push(SETTINGS_ROUTES.EDIT);
  }, [router]);

  const onCopyPublicKey = useCallback(() => {
    void copyToClipboard(withPubkyPrefix(publicKey));
  }, [publicKey, copyToClipboard]);

  const onCopyLink = useCallback(() => {
    void copyToClipboard(link);
  }, [link, copyToClipboard]);

  const onSignOut = useCallback(async () => {
    setIsLoggingOut(true);
    try {
      await AuthController.logout();
      router.push(AUTH_ROUTES.LOGOUT);
    } catch (error) {
      Logger.error('Failed to logout:', error);
      showErrorToast({ description: tLogout('failed') });
      setIsLoggingOut(false);
    }
  }, [router, tLogout]);

  const onStatusChange = useCallback(
    async (status: string) => {
      const currentUserPubky = authStore.currentUserPubky;
      if (!currentUserPubky) {
        Logger.error('No authenticated user found');
        showErrorToast({ description: tStatus('userNotLoaded') });
        return;
      }

      try {
        await ProfileController.commitUpdateStatus({ pubky: currentUserPubky, status });
      } catch (error) {
        Logger.error('Failed to update status:', error);
        showErrorToast({ description: tStatus('updateFailed') });
      }
    },
    [authStore, tStatus],
  );

  return {
    onEdit,
    onCopyPublicKey,
    onCopyLink,
    onSignOut,
    onStatusChange,
    isLoggingOut,
  };
}
