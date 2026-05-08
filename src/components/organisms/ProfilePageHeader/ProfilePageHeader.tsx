'use client';

import { Check, Ellipsis, KeyRound, Link, Loader2, LogOut, Pencil, UserMinus, UserRoundPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { AvatarEmojiBadge } from '@/atoms/AvatarEmojiBadge/AvatarEmojiBadge';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Typography } from '@/atoms/Typography/Typography';
import { FOLLOW_ACTIONS } from '@/hooks/useFollowUser/useFollowUser.types';
import { useTtlSubscription } from '@/hooks/useTtlSubscription/useTtlSubscription';
import { extractEmojiFromStatus, parseStatus } from '@/libs/status/status';
import { cn, formatPublicKey } from '@/libs/utils/utils';
import { PostText } from '@/molecules/PostText/PostText';
import { StatusPickerWrapper } from '@/molecules/StatusPicker/StatusPickerWrapper/StatusPickerWrapper';
import { AvatarWithFallback } from '../AvatarWithFallback/AvatarWithFallback';
import { ProfileMenuActions } from '../ProfileMenuActions/ProfileMenuActions';
import type { ProfilePageHeaderProps } from './ProfilePageHeader.types';

/**
 * ProfilePageHeader
 *
 * Displays the user's profile header with avatar, name, bio, and action buttons.
 *
 * **TTL Tracking:**
 * Subscribes the profile user to TTL tracking when visible in the viewport.
 * This ensures profile data gets refreshed when stale.
 */
export function ProfilePageHeader({ profile, actions, isOwnProfile = true, userId }: ProfilePageHeaderProps) {
  const t = useTranslations('profile.actions');
  const tStatus = useTranslations('status');
  const { avatarUrl, emoji = '🌴', name, bio, publicKey, status } = profile;
  const {
    onEdit,
    onCopyPublicKey,
    onCopyLink,
    onSignOut,
    onStatusChange,
    onAvatarClick,
    isLoggingOut,
    onFollowToggle,
    isFollowLoading,
    followLoadingAction,
    isFollowing,
  } = actions;

  // Subscribe to TTL coordinator based on viewport visibility
  // Use raw userId (without prefix) for proper TTL tracking
  const { ref: ttlRef } = useTtlSubscription({
    type: 'user',
    id: userId,
  });
  const formattedPublicKey = formatPublicKey({
    key: publicKey,
  });
  const displayEmoji = extractEmojiFromStatus(status || '', emoji);
  const getLoadingFollowText = () => {
    if (followLoadingAction === FOLLOW_ACTIONS.UNFOLLOW) {
      return t('unfollowing');
    }
    if (followLoadingAction === FOLLOW_ACTIONS.FOLLOW) {
      return t('followingProgress');
    }
    return t('loading');
  };
  return (
    <Container
      ref={ttlRef}
      overrideDefaults={true}
      className="flex min-w-0 flex-col items-center gap-6 rounded-lg bg-card p-6 lg:flex-row lg:items-start lg:rounded-none lg:bg-transparent lg:p-0"
      data-testid="profile-page-header"
    >
      <Container overrideDefaults={true} className="relative cursor-pointer lg:px-4" onClick={onAvatarClick}>
        <AvatarWithFallback
          avatarUrl={avatarUrl}
          name={name}
          fallbackSeed={userId}
          className="size-16 lg:size-36"
          fallbackClassName="text-2xl lg:text-4xl"
          alt={name}
        />
        <AvatarEmojiBadge emoji={displayEmoji} />
      </Container>

      <Container overrideDefaults={true} className="flex min-w-0 flex-1 flex-col gap-3">
        <Container
          overrideDefaults={true}
          className={cn('flex min-w-0 flex-col text-center lg:text-left', bio && 'gap-1')}
        >
          <Typography
            data-cy="profile-username-header"
            as="h1"
            size="lg"
            className="max-width-profile-page-header w-full truncate leading-normal text-white sm:max-w-xl lg:max-w-full lg:text-6xl lg:leading-normal"
          >
            {name}
          </Typography>
          {bio && (
            <Container data-cy="profile-bio-header" overrideDefaults>
              <PostText content={bio} />
            </Container>
          )}
        </Container>

        <Container
          overrideDefaults={true}
          className="flex flex-wrap items-center justify-center gap-3 lg:justify-start"
        >
          {/* Own profile actions */}
          {isOwnProfile && (
            <>
              <Button data-cy="profile-edit-btn" variant="secondary" size="sm" onClick={onEdit}>
                <Pencil className="size-4" />
                {t('edit')}
              </Button>
              <Button
                data-cy="profile-copy-pubkey-btn"
                className="uppercase"
                variant="secondary"
                size="sm"
                onClick={onCopyPublicKey}
              >
                <KeyRound className="size-4" />
                {formattedPublicKey}
              </Button>
              <Button variant="secondary" size="sm" onClick={onCopyLink}>
                <Link className="size-4" />
                {t('link')}
              </Button>
              <Button variant="secondary" size="sm" onClick={onSignOut} id="profile-logout-btn" disabled={isLoggingOut}>
                {isLoggingOut ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    {t('loggingOut')}
                  </>
                ) : (
                  <>
                    <LogOut className="size-4" />
                    {t('signOut')}
                  </>
                )}
              </Button>
              <StatusPickerWrapper emoji={displayEmoji} status={status || ''} onStatusChange={onStatusChange} />
            </>
          )}

          {/* Other user profile actions */}
          {!isOwnProfile && (
            <>
              {/* Follow/Unfollow button */}
              {onFollowToggle && (
                <Button
                  data-cy="profile-follow-toggle-btn"
                  variant="secondary"
                  size="sm"
                  className="group w-[110px] justify-center"
                  onClick={onFollowToggle}
                  disabled={isFollowLoading}
                >
                  {isFollowLoading ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      {getLoadingFollowText()}
                    </>
                  ) : isFollowing ? (
                    <>
                      <Container overrideDefaults className="flex items-center gap-1.5 group-hover:hidden">
                        <Check className="size-4" />
                        {t('followingButton')}
                      </Container>
                      <Container overrideDefaults className="hidden items-center gap-1.5 group-hover:flex">
                        <UserMinus className="size-4" />
                        {t('unfollow')}
                      </Container>
                    </>
                  ) : (
                    <>
                      <UserRoundPlus className="size-4" />
                      {t('follow')}
                    </>
                  )}
                </Button>
              )}
              <Button
                data-cy="profile-copy-pubkey-btn"
                className="uppercase"
                variant="secondary"
                size="sm"
                onClick={onCopyPublicKey}
              >
                <KeyRound className="size-4" />
                {formattedPublicKey}
              </Button>
              <Button variant="secondary" size="sm" onClick={onCopyLink}>
                <Link className="size-4" />
                {t('link')}
              </Button>
              {/* Three-dot menu with additional profile actions */}
              <ProfileMenuActions
                userId={userId}
                trigger={
                  <Button data-cy="profile-menu-btn" variant="secondary" size="sm" aria-label="Profile actions">
                    <Ellipsis className="size-4" />
                  </Button>
                }
              />
              {/* Status display inline with buttons */}
              {status && (
                <Container overrideDefaults={true} className="flex h-8 items-center gap-1">
                  <Typography as="span" overrideDefaults className="text-base leading-6">
                    {displayEmoji}
                  </Typography>
                  <Typography as="span" overrideDefaults className="text-base leading-6 font-bold text-white">
                    {(() => {
                      const parsed = parseStatus(status);
                      return parsed.key ? tStatus(parsed.key as Parameters<typeof tStatus>[0]) : parsed.text;
                    })()}
                  </Typography>
                </Container>
              )}
            </>
          )}
        </Container>
      </Container>
    </Container>
  );
}
