'use client';

import { useState } from 'react';
import {
  Check,
  Ellipsis,
  KeyRound,
  Link,
  Loader2,
  LogOut,
  Pencil,
  UserMinus,
  UserRoundPlus,
  UsersRound,
} from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Tooltip, TooltipContent, TooltipPortal, TooltipTrigger } from '@/atoms/Tooltip/Tooltip';
import { Typography } from '@/atoms/Typography/Typography';
import { FOLLOW_ACTIONS } from '@/hooks/useFollowUser/useFollowUser.types';
import { useTtlSubscription } from '@/hooks/useTtlSubscription/useTtlSubscription';
import { parseStatus } from '@/libs/status/status';
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
// Mobile lays the action buttons out in a 2-column grid (see the parent Container below),
// so each button only needs to opt into truncation + center-aligned content. The grid handles
// 50/50 widths natively; `lg:order-0` resets any mobile reordering on desktop where buttons
// sit in their natural JSX order in a flex row.
const ACTION_BUTTON_GRID_CELL = 'min-w-0 justify-center lg:order-0';

// Compact notation (e.g. 1.2K, 3M) keeps long follower counts from blowing out the row.
const compactNumber = new Intl.NumberFormat('en-US', { notation: 'compact' });

export function ProfilePageHeader({ profile, actions, isOwnProfile = true, userId, stats }: ProfilePageHeaderProps) {
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
  const [isStatusTooltipOpen, setIsStatusTooltipOpen] = useState(false);
  const parsedStatus = parseStatus(status || '', emoji);
  const displayEmoji = parsedStatus.emoji;
  const followersLabel = stats ? `${compactNumber.format(stats.followers)} FOLLOWERS` : null;
  const getLoadingFollowText = () => {
    if (followLoadingAction === FOLLOW_ACTIONS.UNFOLLOW) {
      return 'Unfollowing...';
    }
    if (followLoadingAction === FOLLOW_ACTIONS.FOLLOW) {
      return 'Following...';
    }
    // The old 'profile.actions.loading' key never existed in the catalog, so this
    // branch rendered the raw key path; 'Loading...' is the intended copy.
    return 'Loading...';
  };
  const copyPublicKeyButton = (
    <Button
      data-cy="profile-copy-pubkey-btn"
      className={cn('uppercase', isOwnProfile && 'order-1', ACTION_BUTTON_GRID_CELL)}
      variant="secondary"
      size="sm"
      onClick={onCopyPublicKey}
    >
      <KeyRound className="size-4" />
      {formattedPublicKey}
    </Button>
  );

  return (
    <Container
      ref={ttlRef}
      overrideDefaults={true}
      className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-3 rounded-none bg-transparent p-0 lg:flex lg:items-start lg:gap-6"
      data-testid="profile-page-header"
    >
      <Container
        overrideDefaults={true}
        className="relative col-start-1 row-start-1 shrink-0 cursor-pointer lg:px-4"
        onClick={onAvatarClick}
      >
        <AvatarWithFallback
          avatarUrl={avatarUrl}
          name={name}
          fallbackSeed={userId}
          className="size-16 lg:size-36"
          fallbackClassName="text-2xl lg:text-4xl"
          alt={name}
        />
      </Container>

      {/* Mobile uses display: contents so children participate in the parent grid; desktop restores a normal flex column. */}
      <Container overrideDefaults={true} className="contents lg:flex lg:min-w-0 lg:flex-1 lg:flex-col lg:gap-3">
        <Container
          overrideDefaults={true}
          className={cn(
            'col-start-2 row-start-1 flex min-w-0 flex-col items-start gap-1 self-center lg:col-auto lg:row-auto lg:self-auto lg:text-left',
          )}
        >
          <Container
            overrideDefaults
            className="max-width-profile-page-header flex w-full min-w-0 items-center gap-2 sm:max-w-xl lg:max-w-full lg:gap-3"
          >
            {/* leading-none + ellipsis clips Inter Tight descenders. Bottom padding keeps the
                missing ~9px inside the clip box (overflow clips at the padding edge) and the
                negative margin cancels it out of layout, so the 60px line and the emoji
                alignment hold. Padding instead of overflow-clip-margin: Safari does not
                support clip-margin, so descenders stayed clipped there. */}
            <Typography
              data-cy="profile-username-header"
              as="h1"
              size="lg"
              className="-mb-[0.15em] min-w-0 truncate pb-[0.15em] leading-8 text-white lg:text-6xl lg:leading-none"
            >
              {name}
            </Typography>
            {displayEmoji && (
              <Tooltip open={isStatusTooltipOpen} onOpenChange={setIsStatusTooltipOpen}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label={`${parsedStatus.text} status`}
                    className="shrink-0 rounded-sm border-0 bg-transparent p-0 text-2xl leading-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none lg:text-5xl"
                    onPointerDown={(event) => {
                      if (event.pointerType !== 'touch') return;

                      event.preventDefault();
                      setIsStatusTooltipOpen((open) => !open);
                    }}
                    onClick={(event) => event.preventDefault()}
                  >
                    {displayEmoji}
                  </button>
                </TooltipTrigger>
                <TooltipPortal>
                  <TooltipContent className="bg-accent font-medium text-foreground [&_svg]:fill-accent">
                    {parsedStatus.text}
                  </TooltipContent>
                </TooltipPortal>
              </Tooltip>
            )}
          </Container>
          <Container overrideDefaults className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 lg:hidden">
            <Container overrideDefaults className="flex min-w-0 items-center gap-1">
              <KeyRound className="size-4 shrink-0 text-muted-foreground" />
              <Typography
                as="span"
                overrideDefaults
                className="truncate text-xs leading-4 font-medium tracking-widest text-muted-foreground uppercase"
              >
                {formattedPublicKey}
              </Typography>
            </Container>
            {isOwnProfile && stats && (
              <Container overrideDefaults className="flex min-w-0 items-center gap-1">
                <UsersRound className="size-4 shrink-0 text-muted-foreground" />
                <Typography
                  as="span"
                  overrideDefaults
                  className="truncate text-xs leading-4 font-medium tracking-widest text-muted-foreground uppercase"
                >
                  {followersLabel}
                </Typography>
              </Container>
            )}
          </Container>
        </Container>

        {bio && (
          <Container data-cy="profile-bio-header" overrideDefaults className="col-span-full min-w-0 lg:col-auto">
            <PostText content={bio} compactUrls={false} />
          </Container>
        )}

        <Container
          overrideDefaults={true}
          className="col-span-full grid w-full grid-cols-2 items-center gap-2 lg:col-auto lg:flex lg:flex-wrap lg:gap-3"
        >
          {/* Own profile actions */}
          {isOwnProfile && (
            <>
              <Button
                data-cy="profile-edit-btn"
                className={cn('order-3', ACTION_BUTTON_GRID_CELL)}
                variant="secondary"
                size="sm"
                onClick={onEdit}
              >
                <Pencil className="size-4" />
                {'Edit profile'}
              </Button>
              {copyPublicKeyButton}
              <Button
                className={cn('order-2', ACTION_BUTTON_GRID_CELL)}
                variant="secondary"
                size="sm"
                onClick={onCopyLink}
              >
                <Link className="size-4" />
                {'Profile link'}
              </Button>
              <Button
                className={cn('order-4', ACTION_BUTTON_GRID_CELL)}
                variant="secondary"
                size="sm"
                onClick={onSignOut}
                id="profile-logout-btn"
                disabled={isLoggingOut}
              >
                {isLoggingOut ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    {'Logging out...'}
                  </>
                ) : (
                  <>
                    <LogOut className="size-4" />
                    {'Sign out'}
                  </>
                )}
              </Button>
              <Container
                overrideDefaults
                className="order-last col-span-2 flex h-8 items-center lg:order-0 lg:col-auto"
              >
                <StatusPickerWrapper emoji={displayEmoji} status={status || ''} onStatusChange={onStatusChange} />
              </Container>
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
                  className={cn('group justify-center lg:w-27.5', ACTION_BUTTON_GRID_CELL)}
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
                        {'Following'}
                      </Container>
                      <Container overrideDefaults className="hidden items-center gap-1.5 group-hover:flex">
                        <UserMinus className="size-4" />
                        {'Unfollow'}
                      </Container>
                    </>
                  ) : (
                    <>
                      <UserRoundPlus className="size-4" />
                      {'Follow'}
                    </>
                  )}
                </Button>
              )}
              {copyPublicKeyButton}
              <Button className={ACTION_BUTTON_GRID_CELL} variant="secondary" size="sm" onClick={onCopyLink}>
                <Link className="size-4" />
                {'Link'}
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
            </>
          )}
        </Container>
      </Container>
    </Container>
  );
}
