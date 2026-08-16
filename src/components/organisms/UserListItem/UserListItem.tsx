'use client';

import { Check, Loader2, StickyNote, Tag, UserMinus, UserRound, UserRoundPlus } from 'lucide-react';
import { getUserProfileUrl } from '@/app/routes';
import { TagKind } from '@/application/tag/tag.types';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Link } from '@/atoms/Link/Link';
import { Typography } from '@/atoms/Typography/Typography';
import { USER_LIST_TAG_MAX_LENGTH, USER_LIST_TAGS_MAX_TOTAL_CHARS } from '@/config/tags';
import { resolveFollowDisplayName } from '@/hooks/useFollowUser/useFollowUser.utils';
import { useRequireAuth } from '@/hooks/useRequireAuth/useRequireAuth';
import { useTtlSubscription } from '@/hooks/useTtlSubscription/useTtlSubscription';
import { cn, formatPublicKey } from '@/libs/utils/utils';
import { useAuthStore } from '@/stores/auth/auth.store';
import { AvatarWithFallback } from '../AvatarWithFallback/AvatarWithFallback';
import { ClickableTagsList } from '../ClickableTagsList/ClickableTagsList';
import type {
  FollowButtonProps,
  StatsSubtitleProps,
  UserListItemProps,
  UserStatsProps,
  VariantProps,
} from './UserListItem.types';

// =============================================================================
// Internal Components
// =============================================================================

/**
 * FollowButton
 * Renders follow/unfollow button in icon or text variant
 */
function FollowButton({ isFollowing, isLoading, isStatusLoading, displayName, variant, onClick }: FollowButtonProps) {
  // Show loading if action is in progress OR if status is still being loaded
  const showLoading = isLoading || isStatusLoading;
  if (variant === 'icon') {
    return (
      <Button
        data-cy="user-list-item-follow-toggle-btn"
        variant="secondary"
        size="icon"
        onClick={onClick}
        disabled={showLoading}
        className="group size-8 shrink-0 rounded-full p-1"
        aria-label={isFollowing ? `${'Unfollow'} ${displayName}` : `${'Follow'} ${displayName}`}
      >
        {showLoading ? (
          <Loader2 className="size-5 animate-spin" />
        ) : isFollowing ? (
          <>
            <Check className="size-5 group-hover:hidden" />
            <UserMinus className="hidden size-5 group-hover:block" />
          </>
        ) : (
          <UserRoundPlus className="size-5" />
        )}
      </Button>
    );
  }

  // iconWithText variant with hover states
  return (
    <Button
      data-cy="user-list-item-follow-toggle-btn"
      variant="secondary"
      size="sm"
      className="group w-[110px] justify-center"
      onClick={onClick}
      disabled={showLoading}
      aria-label={isFollowing ? 'Unfollow' : 'Follow'}
    >
      {showLoading ? (
        <Loader2 className="size-4 animate-spin" />
      ) : isFollowing ? (
        <>
          <Container overrideDefaults className="flex items-center gap-1.5 group-hover:hidden">
            <Check className="size-4" />
            <span>{'Following'}</span>
          </Container>
          <Container overrideDefaults className="hidden items-center gap-1.5 group-hover:flex">
            <UserMinus className="size-4" />
            <span>{'Unfollow'}</span>
          </Container>
        </>
      ) : (
        <>
          <Container overrideDefaults className="flex items-center gap-1.5 group-hover:hidden">
            <UserRoundPlus className="size-4" />
            <span>{'Follow'}</span>
          </Container>
          <Container overrideDefaults className="hidden items-center gap-1.5 group-hover:flex">
            <Check className="size-4" />
            <span>{'Follow'}</span>
          </Container>
        </>
      )}
    </Button>
  );
}

/**
 * MeButton
 * Disabled button shown when viewing own profile
 */
function MeButton({ variant = 'icon', className }: { variant?: 'iconWithText' | 'icon'; className?: string }) {
  if (variant === 'icon') {
    return (
      <Button
        data-cy="user-list-item-me-btn"
        variant="secondary"
        size="icon"
        className={cn(
          'size-8 shrink-0 cursor-not-allowed border-none bg-transparent p-1 opacity-100 hover:bg-transparent',
          className,
        )}
        aria-label={'This is you'}
      >
        <UserRound strokeWidth={2} className="size-5" />
      </Button>
    );
  }
  return (
    <Button
      data-cy="user-list-item-me-btn"
      variant="secondary"
      size="sm"
      className={cn('w-[110px] cursor-not-allowed justify-center text-muted-foreground opacity-50', className)}
      disabled
      aria-label={'This is you'}
    >
      <span>{'Me'}</span>
    </Button>
  );
}

/**
 * StatsSubtitle
 * Compact stats display with icons (for sidebar)
 */
function StatsSubtitle({ tags, posts }: StatsSubtitleProps) {
  return (
    <Container
      overrideDefaults
      className="flex items-center gap-3 text-xs font-medium tracking-[1.2px] text-muted-foreground"
    >
      <Container overrideDefaults className="flex items-center gap-1">
        <Tag className="size-3" />
        <Typography as="span" overrideDefaults>
          {tags}
        </Typography>
      </Container>
      <Container overrideDefaults className="flex items-center gap-1">
        <StickyNote className="size-3" />
        <Typography as="span" overrideDefaults>
          {posts}
        </Typography>
      </Container>
    </Container>
  );
}

/**
 * UserStats
 * Full stats display with labels (for profile pages)
 */
function UserStats({ tags, posts }: UserStatsProps) {
  return (
    <Container overrideDefaults className="flex shrink-0 items-center gap-3">
      <Container className="items-start">
        <Typography className="text-xs font-medium tracking-[1.2px] text-muted-foreground uppercase">
          {'TAGS'}
        </Typography>
        <Typography data-cy="profile-follower-item-tags-count" size="sm" className="font-bold">
          {tags}
        </Typography>
      </Container>
      <Container className="items-start">
        <Typography className="text-xs font-medium tracking-[1.2px] text-muted-foreground uppercase">
          {'POSTS'}
        </Typography>
        <Typography data-cy="profile-follower-item-posts-count" size="sm" className="font-bold">
          {posts}
        </Typography>
      </Container>
    </Container>
  );
}

/**
 * TagsList
 * Renders clickable tags with relationship indicator and toggle functionality
 */
function TagsList({ userId, className }: { userId: string; className?: string }) {
  return (
    <ClickableTagsList
      taggedId={userId}
      taggedKind={TagKind.USER}
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
    <Container
      ref={ttlRef}
      overrideDefaults
      className={cn('flex w-full items-center gap-2 pr-1', className)}
      data-testid={dataTestId || `user-list-item-${user.id}`}
    >
      {/* Clickable user area */}
      <Button
        overrideDefaults
        onClick={onUserClick}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left transition-opacity hover:opacity-80"
        aria-label={`View ${displayName}'s profile`}
      >
        <AvatarWithFallback
          avatarUrl={avatarUrl}
          name={displayName}
          fallbackSeed={user.id}
          size="md"
          className="shrink-0"
        />

        <Container overrideDefaults className="flex max-w-25 min-w-0 flex-1 flex-col">
          <Typography as="span" overrideDefaults className="truncate text-sm font-bold text-foreground">
            {displayName}
          </Typography>
          {showStats ? (
            <StatsSubtitle tags={stats.tags} posts={stats.posts} />
          ) : (
            <Typography
              as="span"
              overrideDefaults
              className="truncate text-xs font-medium tracking-[1.2px] text-muted-foreground uppercase"
            >
              {formattedPublicKey}
            </Typography>
          )}
        </Container>
      </Button>

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
    </Container>
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
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  const profileUrl = getUserProfileUrl(user.id, currentUserPubky);

  return (
    <Container
      ref={ttlRef}
      className={cn('gap-3 rounded-md bg-card p-6 lg:bg-transparent lg:p-0', className)}
      data-testid={dataTestId || `user-list-item-${user.id}`}
    >
      {/* Main row */}
      <Container overrideDefaults className="flex flex-wrap items-center justify-between gap-6 lg:flex-nowrap">
        {/* User info */}
        <Link href={profileUrl} className="flex min-w-0 flex-1 items-center gap-2">
          <AvatarWithFallback avatarUrl={avatarUrl} name={displayName} fallbackSeed={user.id} size="md" />
          <Container overrideDefaults className="min-w-0 flex-1 truncate">
            <Typography data-cy="profile-follower-item-name" size="sm" className="truncate font-bold">
              {displayName}
            </Typography>
            <Typography className="truncate text-xs font-medium tracking-[1.2px] text-muted-foreground uppercase">
              {formattedPublicKey}
            </Typography>
          </Container>
        </Link>

        {/* Desktop: Tags — constrained pills prevent overlay */}
        <TagsList userId={user.id} className="hidden flex-nowrap justify-end *:max-w-[135px] xl:flex" />

        {/* Stats */}
        <UserStats tags={stats.tags} posts={stats.posts} />

        {/* Desktop: Follow Button */}
        {isCurrentUser ? (
          <MeButton variant={followButtonVariant} className="hidden lg:flex" />
        ) : (
          <Container overrideDefaults className="hidden lg:flex">
            <FollowButton
              isFollowing={isFollowing}
              isLoading={isLoading}
              isStatusLoading={isStatusLoading}
              displayName={displayName}
              variant={followButtonVariant}
              onClick={onFollowClick}
            />
          </Container>
        )}
      </Container>

      {/* Mobile: Bottom row */}
      <Container overrideDefaults className="flex flex-wrap items-center gap-3 lg:hidden">
        <TagsList userId={user.id} className="flex-1" />
        <Container overrideDefaults className="ml-auto">
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
        </Container>
      </Container>
    </Container>
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
  const { requireAuth } = useRequireAuth();

  // Subscribe to TTL coordinator based on viewport visibility
  const { ref: ttlRef } = useTtlSubscription({
    type: 'user',
    id: user.id,
  });

  // Normalize user data
  const avatarUrl = user.avatarUrl || user.image || undefined;
  const displayName =
    user.name ||
    formatPublicKey({
      key: user.id,
    });
  const formattedPublicKey = formatPublicKey({
    key: user.id,
  });
  const tags = user.tags || [];
  const stats = user.stats ||
    user.counts || {
      tags: 0,
      posts: 0,
    };
  const isFollowing = isFollowingProp ?? user.isFollowing ?? false;
  const handleUserClick = () => {
    onUserClick?.(user.id);
  };

  // Wrap follow click with auth requirement
  const handleFollowClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    requireAuth(() => onFollowClick?.(user.id, isFollowing, resolveFollowDisplayName(user.id, user.name)));
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
