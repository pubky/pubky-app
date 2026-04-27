'use client';

import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import * as Atoms from '@/atoms';
import * as Libs from '@/libs';
import * as Core from '@/core';
import { FacehashAvatar } from '@/molecules/FacehashAvatar';
import {
  extractUserIdFromAvatarUrl,
  resolveAvatarFallbackSeed,
  resolveAvatarFallbackInitial,
} from './AvatarWithFallback.utils';
import type { AvatarWithFallbackProps } from './AvatarWithFallback.types';
import { EyeOff } from 'lucide-react';
export type { AvatarWithFallbackProps };
export function AvatarWithFallback({
  avatarUrl,
  name,
  fallbackSeed,
  size = 'default',
  className,
  fallbackClassName,
  alt,
  'data-testid': dataTestId,
}: AvatarWithFallbackProps) {
  const [imageError, setImageError] = useState(false);

  // Extract userId from CDN URL for moderation and local avatar resolution
  const userId = extractUserIdFromAvatarUrl(avatarUrl);
  const resolvedFallbackSeed = resolveAvatarFallbackSeed({
    fallbackSeed,
    userId,
    name,
  });
  const fallbackInitial = resolveAvatarFallbackInitial({
    name,
    seed: resolvedFallbackSeed,
  });

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
      Libs.Logger.error('[AvatarWithFallback] Failed to query moderation status', {
        userId,
        error,
      });
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
              <EyeOff className="size-1/2 max-h-10 max-w-10" />
            </Atoms.Container>
          )}
        </>
      )}
      {/* Always render fallback - Radix shows it while image loads or if image fails */}
      <Atoms.AvatarFallback className={Libs.cn('overflow-hidden border-none', fallbackClassName)}>
        <FacehashAvatar seed={resolvedFallbackSeed} initial={fallbackInitial} />
      </Atoms.AvatarFallback>
    </Atoms.Avatar>
  );
}
