'use client';

import { useTranslations } from 'next-intl';
import * as Atoms from '@/atoms';
import * as Hooks from '@/hooks';
import * as Molecules from '@/molecules';
import * as Organisms from '@/organisms';
import * as Libs from '@/libs';
import * as Types from './ProfilePageHeader.types';
import { FOLLOW_ACTIONS } from '@/hooks/useFollowUser/useFollowUser.types';

/**
 * ProfilePageHeader
 *
 * Displays the user's profile header with avatar, name, bio, and action buttons.
 *
 * **TTL Tracking:**
 * Subscribes the profile user to TTL tracking when visible in the viewport.
 * This ensures profile data gets refreshed when stale.
 */
import { Pencil, KeyRound, Link, Loader2, LogOut, Check, UserMinus, UserRoundPlus, Ellipsis } from 'lucide-react';
export function ProfilePageHeader({ profile, actions, isOwnProfile = true, userId }: Types.ProfilePageHeaderProps) {
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
  const { ref: ttlRef } = Hooks.useTtlSubscription({
    type: 'user',
    id: userId,
  });
  const formattedPublicKey = Libs.formatPublicKey({
    key: publicKey,
  });
  const displayEmoji = Libs.extractEmojiFromStatus(status || '', emoji);
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
    <Atoms.Container
      ref={ttlRef}
      overrideDefaults={true}
      className="flex min-w-0 flex-col items-center gap-6 rounded-lg bg-card p-6 lg:flex-row lg:items-start lg:rounded-none lg:bg-transparent lg:p-0"
      data-testid="profile-page-header"
    >
      <Atoms.Container overrideDefaults={true} className="relative cursor-pointer lg:px-4" onClick={onAvatarClick}>
        <Organisms.AvatarWithFallback
          avatarUrl={avatarUrl}
          name={name}
          fallbackSeed={userId}
          className="size-16 lg:size-36"
          fallbackClassName="text-2xl lg:text-4xl"
          alt={name}
        />
        <Atoms.AvatarEmojiBadge emoji={displayEmoji} />
      </Atoms.Container>

      <Atoms.Container overrideDefaults={true} className="flex min-w-0 flex-1 flex-col gap-3">
        <Atoms.Container
          overrideDefaults={true}
          className={Libs.cn('flex min-w-0 flex-col text-center lg:text-left', bio && 'gap-1')}
        >
          <Atoms.Typography
            data-cy="profile-username-header"
            as="h1"
            size="lg"
            className="max-width-profile-page-header w-full truncate leading-normal text-white sm:max-w-xl lg:max-w-full lg:text-6xl lg:leading-normal"
          >
            {name}
          </Atoms.Typography>
          {bio && (
            <Atoms.Container data-cy="profile-bio-header" overrideDefaults>
              <Molecules.PostText content={bio} />
            </Atoms.Container>
          )}
        </Atoms.Container>

        <Atoms.Container
          overrideDefaults={true}
          className="flex flex-wrap items-center justify-center gap-3 lg:justify-start"
        >
          {/* Own profile actions */}
          {isOwnProfile && (
            <>
              <Atoms.Button data-cy="profile-edit-btn" variant="secondary" size="sm" onClick={onEdit}>
                <Pencil className="size-4" />
                {t('edit')}
              </Atoms.Button>
              <Atoms.Button
                data-cy="profile-copy-pubkey-btn"
                className="uppercase"
                variant="secondary"
                size="sm"
                onClick={onCopyPublicKey}
              >
                <KeyRound className="size-4" />
                {formattedPublicKey}
              </Atoms.Button>
              <Atoms.Button variant="secondary" size="sm" onClick={onCopyLink}>
                <Link className="size-4" />
                {t('link')}
              </Atoms.Button>
              <Atoms.Button
                variant="secondary"
                size="sm"
                onClick={onSignOut}
                id="profile-logout-btn"
                disabled={isLoggingOut}
              >
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
              </Atoms.Button>
              <Molecules.StatusPickerWrapper
                emoji={displayEmoji}
                status={status || ''}
                onStatusChange={onStatusChange}
              />
            </>
          )}

          {/* Other user profile actions */}
          {!isOwnProfile && (
            <>
              {/* Follow/Unfollow button */}
              {onFollowToggle && (
                <Atoms.Button
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
                      <Atoms.Container overrideDefaults className="flex items-center gap-1.5 group-hover:hidden">
                        <Check className="size-4" />
                        {t('followingButton')}
                      </Atoms.Container>
                      <Atoms.Container overrideDefaults className="hidden items-center gap-1.5 group-hover:flex">
                        <UserMinus className="size-4" />
                        {t('unfollow')}
                      </Atoms.Container>
                    </>
                  ) : (
                    <>
                      <UserRoundPlus className="size-4" />
                      {t('follow')}
                    </>
                  )}
                </Atoms.Button>
              )}
              <Atoms.Button
                data-cy="profile-copy-pubkey-btn"
                className="uppercase"
                variant="secondary"
                size="sm"
                onClick={onCopyPublicKey}
              >
                <KeyRound className="size-4" />
                {formattedPublicKey}
              </Atoms.Button>
              <Atoms.Button variant="secondary" size="sm" onClick={onCopyLink}>
                <Link className="size-4" />
                {t('link')}
              </Atoms.Button>
              {/* Three-dot menu with additional profile actions */}
              <Organisms.ProfileMenuActions
                userId={userId}
                trigger={
                  <Atoms.Button data-cy="profile-menu-btn" variant="secondary" size="sm" aria-label="Profile actions">
                    <Ellipsis className="size-4" />
                  </Atoms.Button>
                }
              />
              {/* Status display inline with buttons */}
              {status && (
                <Atoms.Container overrideDefaults={true} className="flex h-8 items-center gap-1">
                  <Atoms.Typography as="span" overrideDefaults className="text-base leading-6">
                    {displayEmoji}
                  </Atoms.Typography>
                  <Atoms.Typography as="span" overrideDefaults className="text-base leading-6 font-bold text-white">
                    {(() => {
                      const parsed = Libs.parseStatus(status);
                      return parsed.key ? tStatus(parsed.key as Parameters<typeof tStatus>[0]) : parsed.text;
                    })()}
                  </Atoms.Typography>
                </Atoms.Container>
              )}
            </>
          )}
        </Atoms.Container>
      </Atoms.Container>
    </Atoms.Container>
  );
}
