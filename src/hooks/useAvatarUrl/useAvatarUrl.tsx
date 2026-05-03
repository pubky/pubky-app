'use client';

import { useMemo } from 'react';
import { FileController } from '@/controllers/file/file';
import type { NexusUserDetails } from '@/services/nexus/nexus.types';

/**
 * Hook to compute avatar URL from user details.
 * Returns undefined if user has no image.
 *
 * @param userDetails - User details object (can be null/undefined)
 * @returns Avatar URL string or undefined
 *
 * @example
 * ```tsx
 * const { userDetails } = useUserDetails(userId);
 * const avatarUrl = useAvatarUrl(userDetails);
 * return <Avatar src={avatarUrl} />;
 * ```
 */
export function useAvatarUrl(userDetails: NexusUserDetails | null | undefined): string | undefined {
  return useMemo(() => {
    if (!userDetails?.image) return undefined;
    return FileController.getAvatarUrl(userDetails.id);
  }, [userDetails]);
}
