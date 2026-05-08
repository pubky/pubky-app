'use client';

import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { EyeOff } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/atoms/Avatar/Avatar';
import { Container } from '@/atoms/Container/Container';
import { ModerationController } from '@/controllers/moderation/moderation';
import { Logger } from '@/libs/logger/logger';
import { cn } from '@/libs/utils/utils';
import { ModerationType } from '@/models/moderation/moderation.schema';
import { FacehashAvatar } from '@/molecules/FacehashAvatar/FacehashAvatar';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useLocalFilesStore } from '@/stores/localFiles/localFiles.store';
import type { AvatarWithFallbackProps } from './AvatarWithFallback.types';
import {
  extractUserIdFromAvatarUrl,
  resolveAvatarFallbackInitial,
  resolveAvatarFallbackSeed,
} from './AvatarWithFallback.utils';

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
  const currentUserPubky = useAuthStore((s) => s.currentUserPubky);
  const isCurrentUser = userId === currentUserPubky;

  // Only subscribe to localProfile changes if this is the current user
  // Non-current-user avatars won't re-render when localProfile changes (selector returns stable null)
  const localProfile = useLocalFilesStore((s) => (isCurrentUser ? s.profile : null));

  // Use local blob URL for current user if available, otherwise use CDN URL
  const resolvedAvatarUrl = localProfile ?? avatarUrl;
  const moderationStatus = useLiveQuery(async () => {
    try {
      if (!userId) return null;
      return await ModerationController.getModerationStatus(userId, ModerationType.PROFILE);
    } catch (error) {
      Logger.error('[AvatarWithFallback] Failed to query moderation status', {
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
    ModerationController.unBlur(userId);
  };

  // Reset error state when avatar URL changes
  useEffect(() => {
    setImageError(false);
  }, [resolvedAvatarUrl]);
  return (
    // `key` forces remount so Radix Avatar resets its 'loaded' state and shows the fallback (#526).
    // TODO: cover with E2E/VRT — jsdom can't reproduce real image loading.
    <Avatar key={resolvedAvatarUrl ?? 'fallback'} size={size} className={className} data-testid={dataTestId}>
      {resolvedAvatarUrl && !imageError && (
        <>
          <AvatarImage
            src={resolvedAvatarUrl}
            alt={alt || name}
            onError={() => setImageError(true)}
            className={cn(shouldBlur && 'blur-xs')}
          />

          {shouldBlur && (
            <Container
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
            </Container>
          )}
        </>
      )}
      {/* Always render fallback - Radix shows it while image loads or if image fails */}
      <AvatarFallback className={cn('overflow-hidden border-none', fallbackClassName)}>
        <FacehashAvatar seed={resolvedFallbackSeed} initial={fallbackInitial} />
      </AvatarFallback>
    </Avatar>
  );
}
