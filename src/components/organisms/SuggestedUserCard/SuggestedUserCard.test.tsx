import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SuggestedUser } from '@/hooks/useStarterPackSuggestions/useStarterPackSuggestions.types';
import { formatPublicKey } from '@/libs/utils/utils';
import { SuggestedUserCard } from './SuggestedUserCard';
import { SuggestedUserCardSkeleton } from './SuggestedUserCard.skeleton';

vi.mock('@/organisms/AvatarWithFallback/AvatarWithFallback', () => ({
  AvatarWithFallback: ({ name }: { name: string }) => <div data-testid="avatar" aria-label={name} />,
}));

function makeUser(overrides: Partial<SuggestedUser> = {}): SuggestedUser {
  return {
    id: 'pubky-abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmn',
    name: 'John Carvalho',
    bio: '',
    image: null,
    avatarUrl: null,
    status: null,
    counts: { posts: 158, tags: 761, followers: 0, following: 0 },
    isFollowing: false,
    tags: ['development', 'bitcoin', 'satoshi'],
    matchingTags: ['development', 'bitcoin'],
    ...overrides,
  };
}

describe('SuggestedUserCard', () => {
  const onFollowClick = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders name, truncated pubky, stats and matching tag chips', () => {
    const user = makeUser();
    render(<SuggestedUserCard user={user} onFollowClick={onFollowClick} />);

    expect(screen.getByText('John Carvalho')).toBeInTheDocument();
    expect(screen.getByText(formatPublicKey({ key: user.id }))).toBeInTheDocument();
    expect(screen.getByText('761')).toBeInTheDocument();
    expect(screen.getByText('158')).toBeInTheDocument();
    expect(screen.getByTestId('suggested-user-tag-development')).toBeInTheDocument();
    expect(screen.getByTestId('suggested-user-tag-bitcoin')).toBeInTheDocument();
    // Non-matching profile tags never render, even though the user has them
    expect(screen.queryByTestId('suggested-user-tag-satoshi')).not.toBeInTheDocument();
  });

  it('renders no chips when no profile tag matches the chosen interests', () => {
    render(<SuggestedUserCard user={makeUser({ matchingTags: [] })} onFollowClick={onFollowClick} />);

    expect(screen.queryByTestId(/suggested-user-tag-/)).not.toBeInTheDocument();
  });

  it('keeps the tag chips out of the tab order', () => {
    render(<SuggestedUserCard user={makeUser()} onFollowClick={onFollowClick} />);

    expect(screen.getByTestId('suggested-user-tag-bitcoin')).toHaveAttribute('tabindex', '-1');
  });

  it('is not a link to the profile', () => {
    render(<SuggestedUserCard user={makeUser()} onFollowClick={onFollowClick} />);

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('forwards follow clicks with the current follow state and display name', () => {
    const user = makeUser();
    render(<SuggestedUserCard user={user} onFollowClick={onFollowClick} />);

    fireEvent.click(screen.getByRole('button', { name: 'Follow John Carvalho' }));

    expect(onFollowClick).toHaveBeenCalledWith(user.id, false, 'John Carvalho');
  });

  it('shows the unfollow affordance when already following', () => {
    const user = makeUser({ isFollowing: true });
    render(<SuggestedUserCard user={user} onFollowClick={onFollowClick} />);

    fireEvent.click(screen.getByRole('button', { name: 'Unfollow John Carvalho' }));

    expect(onFollowClick).toHaveBeenCalledWith(user.id, true, 'John Carvalho');
  });

  it('falls back to the formatted pubky as display name and zero stats', () => {
    const user = makeUser({ name: '', counts: undefined });
    render(<SuggestedUserCard user={user} onFollowClick={onFollowClick} />);

    expect(screen.getAllByText('0')).toHaveLength(2);
    expect(screen.getByRole('button', { name: /^Follow / })).toBeInTheDocument();
  });

  it('disables the follow button while loading', () => {
    render(<SuggestedUserCard user={makeUser()} isLoading onFollowClick={onFollowClick} />);

    expect(screen.getByRole('button', { name: 'Follow John Carvalho' })).toBeDisabled();
  });

  it('renders a skeleton without interactive controls', () => {
    render(<SuggestedUserCardSkeleton />);

    expect(screen.getByTestId('suggested-user-card-skeleton')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
