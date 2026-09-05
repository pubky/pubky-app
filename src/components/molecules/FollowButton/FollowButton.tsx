'use client';

import { Check, Loader2, UserMinus, UserRoundPlus } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import type { FollowButtonProps } from './FollowButton.types';

/**
 * FollowButton
 *
 * Follow/unfollow toggle shared by user list items and suggestion cards.
 * Shows a spinner while the action is in flight or the status is still loading.
 */
export function FollowButton({
  isFollowing,
  isLoading,
  isStatusLoading,
  displayName,
  variant,
  onClick,
}: FollowButtonProps) {
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
