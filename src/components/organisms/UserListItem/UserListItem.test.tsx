import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UserListItem } from './UserListItem';
import type { UserListItemData } from './UserListItem.types';

// Mock Hooks
vi.mock('@/hooks', () => ({
  useRequireAuth: () => ({ requireAuth: (fn: () => void) => fn() }),
  useTtlSubscription: () => ({ ref: () => {} }),
}));

// Mock Atoms - lightweight pass-through components
vi.mock('@/atoms', () => ({
  Button: ({
    children,
    variant,
    size,
    overrideDefaults: _overrideDefaults,
    ...rest
  }: React.PropsWithChildren<Record<string, unknown>>) => (
    <button data-size={size} data-variant={variant} {...rest}>
      {children}
    </button>
  ),
  Container: ({
    children,
    overrideDefaults: _overrideDefaults,
    ...rest
  }: React.PropsWithChildren<Record<string, unknown>>) => <div {...rest}>{children}</div>,
  Typography: ({
    children,
    as: Tag = 'span',
    overrideDefaults: _overrideDefaults,
    size: _size,
    ...rest
  }: React.PropsWithChildren<{ as?: React.ElementType } & Record<string, unknown>>) => {
    const Component = Tag as React.ElementType;
    return <Component {...rest}>{children}</Component>;
  },
  Link: ({
    children,
    overrideDefaults: _overrideDefaults,
    ...rest
  }: React.PropsWithChildren<Record<string, unknown>>) => <a {...rest}>{children}</a>,
}));

// Mock Organisms
vi.mock('@/organisms', () => ({
  AvatarWithFallback: () => <div data-testid="avatar" />,
  ClickableTagsList: () => <div data-testid="tags-list" />,
}));

// Mock Libs
vi.mock('@/libs', () => ({
  formatPublicKey: ({ key }: { key: string }) => `pk:${key.slice(0, 8)}`,
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
  Check: (props: Record<string, unknown>) => <svg data-testid="check-icon" {...props} />,
  UserMinus: (props: Record<string, unknown>) => <svg data-testid="user-minus-icon" {...props} />,
  UserRoundPlus: (props: Record<string, unknown>) => <svg data-testid="user-round-plus-icon" {...props} />,
  UserRound: (props: Record<string, unknown>) => <svg data-testid="user-round-icon" {...props} />,
  CircleUserRound: (props: Record<string, unknown>) => <svg data-testid="circle-user-round" {...props} />,
  Tag: (props: Record<string, unknown>) => <svg data-testid="tag-icon" {...props} />,
  StickyNote: (props: Record<string, unknown>) => <svg data-testid="sticky-note-icon" {...props} />,
  Loader2: (props: Record<string, unknown>) => <svg data-testid="loader-icon" {...props} />,
}));

// Mock Core
vi.mock('@/core', () => ({
  TagKind: { USER: 'user' },
}));

// Mock Config
vi.mock('@/config', () => ({
  USER_LIST_TAG_MAX_LENGTH: 8,
  USER_LIST_TAGS_MAX_TOTAL_CHARS: 20,
  USER_LIST_TAGS_MAX_COUNT: 3,
}));

const mockUser: UserListItemData = {
  id: 'test-user-pubky-123456',
  name: 'Test User',
  avatarUrl: 'https://example.com/avatar.jpg',
  tags: ['tag1'],
  stats: { tags: 5, posts: 10 },
  isFollowing: false,
};

describe('UserListItem - followButtonVariant', () => {
  it('defaults to icon variant for compact layout', () => {
    render(<UserListItem user={mockUser} variant="compact" onFollowClick={vi.fn()} />);

    // Icon variant: aria-label includes user name, button has size="icon"
    const followButton = screen.getByRole('button', { name: /Follow Test User/i });
    expect(followButton).toHaveAttribute('data-size', 'icon');
    // No visible "Follow" text
    expect(screen.queryByText('Follow')).not.toBeInTheDocument();
  });

  it('defaults to icon variant for full layout', () => {
    render(<UserListItem user={mockUser} variant="full" onFollowClick={vi.fn()} />);

    // Full variant renders desktop + mobile follow buttons, both should be icon
    const followButtons = screen.getAllByRole('button', { name: /Follow Test User/i });
    expect(followButtons.length).toBeGreaterThan(0);
    followButtons.forEach((btn) => {
      expect(btn).toHaveAttribute('data-size', 'icon');
    });
    expect(screen.queryByText('Follow')).not.toBeInTheDocument();
  });

  it('shows icon and text when followButtonVariant="iconWithText"', () => {
    render(
      <UserListItem user={mockUser} variant="compact" followButtonVariant="iconWithText" onFollowClick={vi.fn()} />,
    );

    // iconWithText variant shows both icon and visible "Follow" text
    expect(screen.getByTestId('user-round-plus-icon')).toBeInTheDocument();
    expect(screen.getAllByText('Follow').length).toBeGreaterThan(0);
  });

  it('shows check icon and "Following" text when iconWithText and isFollowing', () => {
    render(
      <UserListItem
        user={{ ...mockUser, isFollowing: true }}
        variant="compact"
        followButtonVariant="iconWithText"
        onFollowClick={vi.fn()}
      />,
    );

    // iconWithText + isFollowing shows Check icon and "Following" text
    expect(screen.getByTestId('check-icon')).toBeInTheDocument();
    const followingText = screen.getByText('Following');
    expect(followingText).toBeInTheDocument();
    // Hover state also renders "Unfollow" text and UserMinus icon
    expect(screen.getByTestId('user-minus-icon')).toBeInTheDocument();
    const unfollowText = screen.getByText('Unfollow');
    expect(unfollowText).toBeInTheDocument();

    // Verify the button has "group" class to enable group-hover for children
    const button = followingText.closest('button');
    expect(button).toHaveClass('group');

    // Verify CSS classes that swap visibility on hover
    const followingContainer = followingText.closest('div');
    expect(followingContainer).toHaveClass('group-hover:hidden');
    const unfollowContainer = unfollowText.closest('div');
    expect(unfollowContainer).toHaveClass('group-hover:flex');
  });

  it('defaults to icon variant for MeButton when isCurrentUser', () => {
    render(<UserListItem user={mockUser} variant="compact" isCurrentUser />);

    // MeButton icon variant: aria-label "This is you", size="icon", no "Me" text
    const meButton = screen.getByRole('button', { name: /This is you/i });
    expect(meButton).toHaveAttribute('data-size', 'icon');
    expect(screen.queryByText('Me')).not.toBeInTheDocument();
  });

  it('shows Me text when followButtonVariant="iconWithText" and isCurrentUser', () => {
    render(<UserListItem user={mockUser} variant="compact" isCurrentUser followButtonVariant="iconWithText" />);

    expect(screen.getByText('Me')).toBeInTheDocument();
  });
});

describe('UserListItem - Snapshots', () => {
  it('matches snapshot for compact variant', () => {
    const { container } = render(<UserListItem user={mockUser} variant="compact" onFollowClick={vi.fn()} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for compact variant with stats', () => {
    const { container } = render(<UserListItem user={mockUser} variant="compact" showStats onFollowClick={vi.fn()} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for compact variant when following', () => {
    const { container } = render(
      <UserListItem user={{ ...mockUser, isFollowing: true }} variant="compact" onFollowClick={vi.fn()} />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for compact variant as current user', () => {
    const { container } = render(<UserListItem user={mockUser} variant="compact" isCurrentUser />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for full variant', () => {
    const { container } = render(<UserListItem user={mockUser} variant="full" onFollowClick={vi.fn()} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
