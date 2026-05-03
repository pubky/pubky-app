import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UserListItem } from './UserListItem';
import type { UserListItemData } from './UserListItem.types';

// Mock Hooks
vi.mock('@/hooks/useRequireAuth/useRequireAuth', () => ({
  useRequireAuth: () => ({ requireAuth: (fn: () => void) => fn() }),
}));

vi.mock('@/hooks/useTtlSubscription/useTtlSubscription', () => ({
  useTtlSubscription: () => ({ ref: () => {} }),
}));

// Mock Atoms - lightweight pass-through components
vi.mock('@/atoms/Button/Button', () => {
  return {
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
  };
});

vi.mock('@/atoms/Container/Container', () => {
  return {
    Container: ({
      children,
      overrideDefaults: _overrideDefaults,
      ...rest
    }: React.PropsWithChildren<Record<string, unknown>>) => <div {...rest}>{children}</div>,
  };
});

vi.mock('@/atoms/Link/Link', () => {
  return {
    Link: ({
      children,
      overrideDefaults: _overrideDefaults,
      ...rest
    }: React.PropsWithChildren<Record<string, unknown>>) => <a {...rest}>{children}</a>,
  };
});

vi.mock('@/atoms/Typography/Typography', () => {
  return {
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
  };
});

// Mock Organisms
vi.mock('@/organisms/AvatarWithFallback/AvatarWithFallback', () => {
  return {
    AvatarWithFallback: () => <div data-testid="avatar" />,
  };
});

vi.mock('@/organisms/ClickableTagsList/ClickableTagsList', () => {
  return {
    ClickableTagsList: () => <div data-testid="tags-list" />,
  };
});

// Mock dependencies
vi.mock('@/application/tag/tag.types', () => ({
  TagKind: { USER: 'user' },
}));

// Mock Config
vi.mock('@/config/tags', () => ({
  USER_LIST_TAG_MAX_LENGTH: 8,
  USER_LIST_TAGS_MAX_TOTAL_CHARS: 20,
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
    const followBtn = screen.getByRole('button', { name: /^Follow$/i });
    expect(followBtn.querySelector('.lucide-user-round-plus')).toBeInTheDocument();
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

    const followingText = screen.getByText('Following');
    expect(followingText).toBeInTheDocument();
    const followToggle = followingText.closest('button') as HTMLButtonElement;
    expect(followToggle.querySelector('.lucide-check')).toBeInTheDocument();
    // Hover state also renders "Unfollow" text and UserMinus icon
    expect(followToggle.querySelector('.lucide-user-minus')).toBeInTheDocument();
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
