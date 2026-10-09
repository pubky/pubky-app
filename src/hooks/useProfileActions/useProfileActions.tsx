'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { SETTINGS_ROUTES } from '@/app/routes';
import { ProfileController } from '@/controllers/profile/profile';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard/useCopyToClipboard';
import { useRequireAuth } from '@/hooks/useRequireAuth/useRequireAuth';
import { useSignOut } from '@/hooks/useSignOut/useSignOut';
import { ClientErrorCode } from '@/libs/error/error.codes';
import { isAppError } from '@/libs/error/error.utils';
import { Logger } from '@/libs/logger/logger';
import { withPubkyPrefix } from '@/libs/utils/utils';
import { toast } from '@/molecules/Toaster/toast';
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
  const { copyToClipboard: copyProfileLinkToClipboard } = useCopyToClipboard({
    successTitle: 'Profile link copied to clipboard',
  });
  const { requireAuth } = useRequireAuth();
  const { handleSignOut: onSignOut, isLoading: isLoggingOut } = useSignOut();

  const onEdit = useCallback(() => {
    router.push(SETTINGS_ROUTES.EDIT);
  }, [router]);

  const onCopyPublicKey = useCallback(() => {
    void copyToClipboard(withPubkyPrefix(publicKey));
  }, [publicKey, copyToClipboard]);

  const onCopyLink = useCallback(() => {
    void copyProfileLinkToClipboard(link);
  }, [link, copyProfileLinkToClipboard]);

  const onStatusChange = async (status: string) => {
    if (!requireAuth(() => true)) return;
    const currentUserPubky = useAuthStore.getState().currentUserPubky;
    if (!currentUserPubky) {
      Logger.error('No authenticated user found');
      toast({ variant: 'error', description: 'Could not load profile. Try again.' });
      return;
    }

    try {
      await ProfileController.commitUpdateStatus({ pubky: currentUserPubky, status });
    } catch (error) {
      Logger.error('Failed to update status:', error);
      // A missing homeserver profile maps to GONE before the PUT. Explain why the status
      // cannot be saved; other failures keep the generic retry message.
      const isDeletedProfile = isAppError(error) && error.code === ClientErrorCode.GONE;
      toast({
        variant: 'error',
        description: isDeletedProfile ? error.message : 'Could not update status. Try again.',
      });
    }
  };

  return {
    onEdit,
    onCopyPublicKey,
    onCopyLink,
    onSignOut,
    onStatusChange,
    isLoggingOut,
  };
}
