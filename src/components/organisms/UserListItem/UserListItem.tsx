'use client';

import { useTranslations } from 'next-intl';
import * as Atoms from '@/atoms';
import * as Organisms from '@/organisms';
import * as Hooks from '@/hooks';
import * as Libs from '@/libs';
import * as Core from '@/core';
import type {
  UserListItemProps,
  FollowButtonProps,
  StatsSubtitleProps,
  UserStatsProps,
  VariantProps,
} from './UserListItem.types';
import { USER_LIST_TAG_MAX_LENGTH, USER_LIST_TAGS_MAX_TOTAL_CHARS, USER_LIST_TAGS_MAX_COUNT } from '@/config';

// =============================================================================
// Internal Components
// =============================================================================

/**
 * FollowButton
 * Renders follow/unfollow button in icon or text variant
 */
function FollowButton({ isFollowing, isLoading, isStatusLoading, displayName, variant, onClick }: FollowButtonProps) {
  const t = useTranslations('userList');
  // Show loading if action is in progress OR if status is still being loaded
  const showLoading = isLoading || isStatusLoading;

  if (variant === 'icon') {
    return (
      <Atoms.Button
        data-cy="user-list-item-follow-toggle-btn"
        variant="secondary"
        size="icon"
        onClick={onClick}
        disabled={showLoading}
        className="group size-8 shrink-0 rounded-full"
        aria-label={isFollowing ? `${t('unfollow')} ${displayName}` : `${t('follow')} ${displayName}`}
      >
        {showLoading ? (
          <Libs.Loader2 className="size-5 animate-spin" />
        ) : isFollowing ? (
          <>
            <Libs.Check className="size-5 group-hover:hidden" />
            <Libs.UserMinus className="hidden size-5 group-hover:block" />
          </>
        ) : (
          <Libs.UserRoundPlus className="size-5" />
        )}
      </Atoms.Button>
    );
  }

  // iconWithText variant with hover states
  return (
    <Atoms.Button
      data-cy="user-list-item-follow-toggle-btn"
      variant="secondary"
      size="sm"
      className="group w-[110px] justify-center"
      onClick={onClick}
      disabled={showLoading}
      aria-label={isFollowing ? t('unfollow') : t('follow')}
    >
      {showLoading ? (
        <Libs.Loader2 className="size-4 animate-spin" />
      ) : isFollowing ? (
        <>
          <Atoms.Container overrideDefaults className="flex items-center gap-1.5 group-hover:hidden">
            <Libs.Check className="size-4" />
            <span>{t('following')}</span>
          </Atoms.Container>
          <Atoms.Container overrideDefaults className="hidden items-center gap-1.5 group-hover:flex">
            <Libs.UserMinus className="size-4" />
            <span>{t('unfollow')}</span>
          </Atoms.Container>
        </>
      ) : (
        <>
          <Atoms.Container overrideDefaults className="flex items-center gap-1.5 group-hover:hidden">
            <Libs.UserRoundPlus className="size-4" />
            <span>{t('follow')}</span>
          </Atoms.Container>
          <Atoms.Container overrideDefaults className="hidden items-center gap-1.5 group-hover:flex">
            <Libs.Check className="size-4" />
            <span>{t('follow')}</span>
          </Atoms.Container>
        </>
      )}
    </Atoms.Button>
  );
}

/**
 * MeButton
 * Disabled button shown when viewing own profile
 */
function MeButton({ variant = 'icon', className }: { variant?: 'iconWithText' | 'icon'; className?: string }) {
  const t = useTranslations('userList');
  const tProfile = useTranslations('profile.actions');

  if (variant === 'icon') {
    return (
      <Atoms.Button
        data-cy="user-list-item-me-btn"
        variant="secondary"
        size="icon"
        className={Libs.cn('size-8 shrink-0 cursor-not-allowed rounded-full opacity-50', className)}
        disabled
        aria-label={tProfile('thisIsYou')}
      >
        <Libs.CircleUserRound className="size-5 text-muted-foreground" />
      </Atoms.Button>
    );
  }

  return (
    <Atoms.Button
      data-cy="user-list-item-me-btn"
      variant="secondary"
      size="sm"
      className={Libs.cn('w-[110px] cursor-not-allowed justify-center text-muted-foreground opacity-50', className)}
      disabled
      aria-label={tProfile('thisIsYou')}
    >
      <span>{t('me')}</span>
    </Atoms.Button>
  );
}

/**
 * StatsSubtitle
 * Compact stats display with icons (for sidebar)
 */
function StatsSubtitle({ tags, posts }: StatsSubtitleProps) {
  return (
    <Atoms.Container
      overrideDefaults
      className="flex items-center gap-3 text-xs font-medium tracking-[1.2px] text-muted-foreground"
    >
      <Atoms.Container overrideDefaults className="flex items-center gap-1">
        <Libs.Tag className="size-3" />
        <Atoms.Typography as="span" overrideDefaults>
          {tags}
        </Atoms.Typography>
      </Atoms.Container>
      <Atoms.Container overrideDefaults className="flex items-center gap-1">
        <Libs.StickyNote className="size-3" />
        <Atoms.Typography as="span" overrideDefaults>
          {posts}
        </Atoms.Typography>
      </Atoms.Container>
    </Atoms.Container>
  );
}

/**
 * UserStats
 * Full stats display with labels (for profile pages)
 */
function UserStats({ tags, posts }: UserStatsProps) {
  const t = useTranslations('userList');

  return (
    <Atoms.Container overrideDefaults className="flex shrink-0 items-center gap-3">
      <Atoms.Container className="items-start">
        <Atoms.Typography className="text-xs font-medium tracking-[1.2px] text-muted-foreground uppercase">
          {t('tags')}
        </Atoms.Typography>
        <Atoms.Typography data-cy="profile-follower-item-tags-count" size="sm" className="font-bold">
          {tags}
        </Atoms.Typography>
      </Atoms.Container>
      <Atoms.Container className="items-start">
        <Atoms.Typography className="text-xs font-medium tracking-[1.2px] text-muted-foreground uppercase">
          {t('posts')}
        </Atoms.Typography>
        <Atoms.Typography data-cy="profile-follower-item-posts-count" size="sm" className="font-bold">
          {posts}
        </Atoms.Typography>
      </Atoms.Container>
    </Atoms.Container>
  );
}

/**
 * TagsList
 * Renders clickable tags with relationship indicator and toggle functionality
 */
function TagsList({ userId, className }: { userId: string; className?: string }) {
  return (
    <Organisms.ClickableTagsList
      taggedId={userId}
      taggedKind={Core.TagKind.USER}
      maxTags={USER_LIST_TAGS_MAX_COUNT}
      maxTagLength={USER_LIST_TAG_MAX_LENGTH}
      maxTotalChars={USER_LIST_TAGS_MAX_TOTAL_CHARS}
      showCount={false}
      className={className}
    />
  );
}

// =============================================================================
// Variant Components
// =============================================================================

/**
 * CompactVariant
 * For sidebars (WhoToFollow, ActiveUsers)
 */
function CompactVariant({
  user,
  avatarUrl,
  displayName,
  formattedPublicKey,
  stats,
  isFollowing,
  isLoading,
  isStatusLoading,
  isCurrentUser,
  showStats,
  followButtonVariant,
  className,
  dataTestId,
  onUserClick,
  onFollowClick,
  ttlRef,
}: VariantProps) {
  return (
    <Atoms.Container
      ref={ttlRef}
      overrideDefaults
      className={Libs.cn('flex w-full items-center gap-2', className)}
      data-testid={dataTestId || `user-list-item-${user.id}`}
    >
      {/* Clickable user area */}
      <Atoms.Button
        overrideDefaults
        onClick={onUserClick}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left transition-opacity hover:opacity-80"
        aria-label={`View ${displayName}'s profile`}
      >
        <Organisms.AvatarWithFallback
          avatarUrl={avatarUrl}
          name={displayName}
          fallbackSeed={user.id}
          size="md"
          className="shrink-0"
        />

        <Atoms.Container overrideDefaults className="flex min-w-0 flex-1 flex-col">
          <Atoms.Typography as="span" overrideDefaults className="truncate text-sm font-bold text-foreground">
            {displayName}
          </Atoms.Typography>
          {showStats ? (
            <StatsSubtitle tags={stats.tags} posts={stats.posts} />
          ) : (
            <Atoms.Typography
              as="span"
              overrideDefaults
              className="truncate text-xs font-medium tracking-[1.2px] text-muted-foreground uppercase"
            >
              {formattedPublicKey}
            </Atoms.Typography>
          )}
        </Atoms.Container>
      </Atoms.Button>

      {/* Follow button or Me button */}
      {isCurrentUser ? (
        <MeButton variant={followButtonVariant} />
      ) : (
        <FollowButton
          isFollowing={isFollowing}
          isLoading={isLoading}
          isStatusLoading={isStatusLoading}
          displayName={displayName}
          variant={followButtonVariant}
          onClick={onFollowClick}
        />
      )}
    </Atoms.Container>
  );
}

/**
 * FullVariant
 * For profile pages (Followers, Following)
 */
function FullVariant({
  user,
  avatarUrl,
  displayName,
  formattedPublicKey,
  stats,
  isFollowing,
  isLoading,
  isStatusLoading,
  isCurrentUser,
  followButtonVariant,
  className,
  dataTestId,
  onFollowClick,
  ttlRef,
}: VariantProps) {
  return (
    <Atoms.Container
      ref={ttlRef}
      className={Libs.cn('gap-3 rounded-md bg-card p-6 lg:bg-transparent lg:p-0', className)}
      data-testid={dataTestId || `user-list-item-${user.id}`}
    >
      {/* Main row */}
      <Atoms.Container overrideDefaults className="flex flex-wrap items-center justify-between gap-6 lg:flex-nowrap">
        {/* User info */}
        <Atoms.Link href={`/profile/${user.id}`} className="flex min-w-0 flex-1 items-center gap-2">
          <Organisms.AvatarWithFallback avatarUrl={avatarUrl} name={displayName} fallbackSeed={user.id} size="md" />
          <Atoms.Container overrideDefaults className="min-w-0 flex-1 truncate">
            <Atoms.Typography data-cy="profile-follower-item-name" size="sm" className="truncate font-bold">
              {displayName}
            </Atoms.Typography>
            <Atoms.Typography className="truncate text-xs font-medium tracking-[1.2px] text-muted-foreground uppercase">
              {formattedPublicKey}
            </Atoms.Typography>
          </Atoms.Container>
        </Atoms.Link>

        {/* Desktop: Tags — constrained pills prevent overlay */}
        <TagsList userId={user.id} className="hidden flex-nowrap justify-end *:max-w-[135px] xl:flex" />

        {/* Stats */}
        <UserStats tags={stats.tags} posts={stats.posts} />

        {/* Desktop: Follow Button */}
        {isCurrentUser ? (
          <MeButton variant={followButtonVariant} className="hidden lg:flex" />
        ) : (
          <Atoms.Container overrideDefaults className="hidden lg:flex">
            <FollowButton
              isFollowing={isFollowing}
              isLoading={isLoading}
              isStatusLoading={isStatusLoading}
              displayName={displayName}
              variant={followButtonVariant}
              onClick={onFollowClick}
            />
          </Atoms.Container>
        )}
      </Atoms.Container>

      {/* Mobile: Bottom row */}
      <Atoms.Container overrideDefaults className="flex flex-wrap items-center gap-3 lg:hidden">
        <TagsList userId={user.id} className="flex-1" />
        <Atoms.Container overrideDefaults className="ml-auto">
          {isCurrentUser ? (
            <MeButton variant={followButtonVariant} />
          ) : (
            <FollowButton
              isFollowing={isFollowing}
              isLoading={isLoading}
              isStatusLoading={isStatusLoading}
              displayName={displayName}
              variant={followButtonVariant}
              onClick={onFollowClick}
            />
          )}
        </Atoms.Container>
      </Atoms.Container>
    </Atoms.Container>
  );
}

// =============================================================================
// Main Component
// =============================================================================

/**
 * UserListItem
 *
 * Unified component for displaying user items in lists.
 * Supports two variants:
 * - `compact`: For sidebars (WhoToFollow, ActiveUsers) - avatar, name, subtitle, icon button
 * - `full`: For profile pages (Followers, Following) - avatar, name, pubky, tags, stats, text button
 *
 * **TTL Tracking:**
 * Subscribes the user to TTL tracking when visible in the viewport.
 * This ensures user data gets refreshed when stale.
 */
export function UserListItem({
  user,
  variant = 'compact',
  isFollowing: isFollowingProp,
  isLoading = false,
  isStatusLoading = false,
  isCurrentUser = false,
  showStats = false,
  followButtonVariant: followButtonVariantProp,
  onUserClick,
  onFollowClick,
  className,
  'data-testid': dataTestId,
}: UserListItemProps) {
  // Auth requirement for follow action
  const { requireAuth } = Hooks.useRequireAuth();

  // Subscribe to TTL coordinator based on viewport visibility
  const { ref: ttlRef } = Hooks.useTtlSubscription({
    type: 'user',
    id: user.id,
  });

  // Normalize user data
  const avatarUrl = user.avatarUrl || user.image || undefined;
  const displayName = user.name || Libs.formatPublicKey({ key: user.id });
  const formattedPublicKey = Libs.formatPublicKey({ key: user.id });
  const tags = user.tags || [];
  const stats = user.stats || user.counts || { tags: 0, posts: 0 };
  const isFollowing = isFollowingProp ?? user.isFollowing ?? false;

  const handleUserClick = () => {
    onUserClick?.(user.id);
  };

  // Wrap follow click with auth requirement
  const handleFollowClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    requireAuth(() => onFollowClick?.(user.id, isFollowing));
  };

  const commonProps: VariantProps = {
    user,
    avatarUrl,
    displayName,
    formattedPublicKey,
    tags,
    stats,
    isFollowing,
    isLoading,
    isStatusLoading,
    isCurrentUser,
    showStats,
    className,
    dataTestId,
    onUserClick: handleUserClick,
    followButtonVariant: followButtonVariantProp ?? 'icon',
    onFollowClick: handleFollowClick,
    ttlRef,
  };

  if (variant === 'compact') {
    return <CompactVariant {...commonProps} />;
  }

  return <FullVariant {...commonProps} />;
}
