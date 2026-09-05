'use client';

import { Container } from '@/atoms/Container/Container';
import { Typography } from '@/atoms/Typography/Typography';
import { resolveFollowDisplayName } from '@/hooks/useFollowUser/useFollowUser.utils';
import { cn, formatPublicKey, generateRandomColor } from '@/libs/utils/utils';
import { FollowButton } from '@/molecules/FollowButton/FollowButton';
import { PostTag } from '@/molecules/PostTag/PostTag';
import { UserStats } from '@/molecules/UserStats/UserStats';
import { AvatarWithFallback } from '@/organisms/AvatarWithFallback/AvatarWithFallback';
import type { SuggestedUserCardProps } from './SuggestedUserCard.types';

/**
 * SuggestedUserCard
 *
 * Suggestion card for the onboarding "Follow your best matches" step: avatar, name, truncated
 * pubky, TAGS / POSTS counts, up to two read-only profile-tag chips that intersect the chosen
 * interests, and an icon follow toggle. Deliberately not a profile link: onboarding should not
 * leak the user out of the flow.
 */
export function SuggestedUserCard({
  user,
  isLoading = false,
  isStatusLoading = false,
  onFollowClick,
  className,
  'data-testid': dataTestId,
}: SuggestedUserCardProps) {
  const displayName = resolveFollowDisplayName(user.id, user.name);
  const formattedPublicKey = formatPublicKey({ key: user.id });
  const isFollowing = user.isFollowing ?? false;
  const stats = { tags: user.counts?.tags ?? 0, posts: user.counts?.posts ?? 0 };

  return (
    <Container
      className={cn('gap-3 rounded-md border border-accent bg-card p-6 shadow-lg', className)}
      data-testid={dataTestId || `suggested-user-card-${user.id}`}
      data-cy="suggested-user-card"
    >
      <Container overrideDefaults className="flex items-start justify-between gap-2">
        <Container overrideDefaults className="flex min-w-0 flex-1 items-center gap-2">
          <AvatarWithFallback
            avatarUrl={user.avatarUrl ?? undefined}
            name={displayName}
            fallbackSeed={user.id}
            size="md"
          />
          <Container overrideDefaults className="min-w-0 flex-1 truncate">
            <Typography size="sm" className="truncate font-bold" data-cy="suggested-user-card-name">
              {displayName}
            </Typography>
            <Typography className="truncate text-xs font-medium tracking-[1.2px] text-muted-foreground uppercase">
              {formattedPublicKey}
            </Typography>
          </Container>
        </Container>
        <UserStats tags={stats.tags} posts={stats.posts} />
      </Container>

      <Container overrideDefaults className="flex flex-wrap items-center gap-3">
        <Container overrideDefaults className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          {user.matchingTags.map((label) => (
            // Display-only chips: the intersecting interests are informative, not actionable here.
            <PostTag
              key={label}
              label={label}
              color={generateRandomColor(label)}
              tabIndex={-1}
              className="pointer-events-none"
              data-testid={`suggested-user-tag-${label}`}
            />
          ))}
        </Container>
        <Container overrideDefaults className="ml-auto">
          <FollowButton
            isFollowing={isFollowing}
            isLoading={isLoading}
            isStatusLoading={isStatusLoading}
            displayName={displayName}
            variant="icon"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onFollowClick(user.id, isFollowing, displayName);
            }}
          />
        </Container>
      </Container>
    </Container>
  );
}
