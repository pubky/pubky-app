'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as Core from '@/core';
import * as Libs from '@/libs';
import * as Molecules from '@/molecules';
import { AUTH_ROUTES, SETTINGS_ROUTES } from '@/app';
// Import directly to avoid circular dependency with @/hooks barrel
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';

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
  const authStore = Core.useAuthStore();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const tLogout = useTranslations('toast.logout');
  const tStatus = useTranslations('toast.status');

  const onEdit = useCallback(() => {
    router.push(SETTINGS_ROUTES.EDIT);
  }, [router]);

  const onCopyPublicKey = useCallback(() => {
    void copyToClipboard(Libs.withPubkyPrefix(publicKey));
  }, [publicKey, copyToClipboard]);

  const onCopyLink = useCallback(() => {
    void copyToClipboard(link);
  }, [link, copyToClipboard]);

  const onSignOut = useCallback(async () => {
    setIsLoggingOut(true);
    try {
      await Core.AuthController.logout();
      router.push(AUTH_ROUTES.LOGOUT);
    } catch (error) {
      Libs.Logger.error('Failed to logout:', error);
      Molecules.showErrorToast({ description: tLogout('failed') });
      setIsLoggingOut(false);
    }
  }, [router, tLogout]);

  const onStatusChange = useCallback(
    async (status: string) => {
      const currentUserPubky = authStore.currentUserPubky;
      if (!currentUserPubky) {
        Libs.Logger.error('No authenticated user found');
        Molecules.showErrorToast({ description: tStatus('userNotLoaded') });
        return;
      }

      try {
        await Core.ProfileController.commitUpdateStatus({ pubky: currentUserPubky, status });
      } catch (error) {
        Libs.Logger.error('Failed to update status:', error);
        Molecules.showErrorToast({ description: tStatus('updateFailed') });
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
