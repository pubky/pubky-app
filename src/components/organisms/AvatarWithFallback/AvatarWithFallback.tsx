'use client';

import { useState, useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import * as Atoms from '@/atoms';
import * as Libs from '@/libs';
import * as Core from '@/core';
import { extractUserIdFromAvatarUrl } from './AvatarWithFallback.utils';

export interface AvatarWithFallbackProps {
  avatarUrl?: string;
  name: string;
  size?: Atoms.AvatarSize;
  className?: string;
  fallbackClassName?: string;
  alt?: string;
  'data-testid'?: string;
}

export function AvatarWithFallback({
  avatarUrl,
  name,
  size = 'default',
  className,
  fallbackClassName,
  alt,
  'data-testid': dataTestId,
}: AvatarWithFallbackProps) {
  const [imageError, setImageError] = useState(false);

  // Extract userId from CDN URL for moderation and local avatar resolution
  const userId = useMemo(() => extractUserIdFromAvatarUrl(avatarUrl), [avatarUrl]);

  // Check if this avatar belongs to the current user
  const currentUserPubky = Core.useAuthStore((s) => s.currentUserPubky);
  const isCurrentUser = userId === currentUserPubky;

  // Only subscribe to localProfile changes if this is the current user
  // Non-current-user avatars won't re-render when localProfile changes (selector returns stable null)
  const localProfile = Core.useLocalFilesStore((s) => (isCurrentUser ? s.profile : null));

  // Use local blob URL for current user if available, otherwise use CDN URL
  const resolvedAvatarUrl = localProfile ?? avatarUrl;

  const moderationStatus = useLiveQuery(async () => {
    try {
      if (!userId) return null;
      return await Core.ModerationController.getModerationStatus(userId, Core.ModerationType.PROFILE);
    } catch (error) {
      Libs.Logger.error('[AvatarWithFallback] Failed to query moderation status', { userId, error });
      return null;
    }
  }, [userId]);

  // Show image immediately, apply blur only when status confirms
  const shouldBlur = moderationStatus?.is_blurred ?? false;

  const handleUnblur = () => {
    if (!userId) return;
    Core.ModerationController.unBlur(userId);
  };

  // Reset error state when avatar URL changes
  useEffect(() => {
    setImageError(false);
  }, [resolvedAvatarUrl]);

  return (
    <Atoms.Avatar size={size} className={className} data-testid={dataTestId}>
      {resolvedAvatarUrl && !imageError && (
        <>
          <Atoms.AvatarImage
            src={resolvedAvatarUrl}
            alt={alt || name}
            onError={() => setImageError(true)}
            className={Libs.cn(shouldBlur && 'blur-xs')}
          />

          {shouldBlur && (
            <Atoms.Container
              overrideDefaults
              role="button"
              tabIndex={0}
              aria-label="Show blurred content"
              onClick={(e) => {
                e.stopPropagation();
                handleUnblur();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  e.stopPropagation();
                  handleUnblur();
                }
              }}
              className="absolute inset-0 flex cursor-pointer items-center justify-center"
            >
              <Libs.EyeOff className="size-1/2 max-h-10 max-w-10" />
            </Atoms.Container>
          )}
        </>
      )}
      {/* Always render fallback - Radix shows it while image loads or if image fails */}
      <Atoms.AvatarFallback className={fallbackClassName}>{Libs.extractInitials({ name })}</Atoms.AvatarFallback>
    </Atoms.Avatar>
  );
}
