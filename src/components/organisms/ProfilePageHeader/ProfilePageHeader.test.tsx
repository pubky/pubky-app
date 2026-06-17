import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FOLLOW_ACTIONS } from '@/hooks/useFollowUser/useFollowUser.types';
import { resetViewport, setMobileViewport } from '@/test-utils/viewport';
import enMessages from '../../../../messages/en.json';
import { ProfilePageHeader } from './ProfilePageHeader';
import { ProfilePageHeaderProps } from './ProfilePageHeader.types';

// Mock Molecules components
vi.mock('@/molecules/PostText/PostText', () => {
  return {
    PostText: ({ content }: { content: string }) => <div data-testid="post-text">{content}</div>,
  };
});

// Mock Organisms components
vi.mock('@/molecules/AvatarZoomModal/AvatarZoomModal', () => {
  return {
    AvatarZoomModal: ({
      open,
      onClose,
      avatarUrl,
      name,
    }: {
      open: boolean;
      onClose: () => void;
      avatarUrl?: string;
      name: string;
    }) =>
      open ? (
        <div data-testid="avatar-zoom-modal">
          {avatarUrl ? (
            <img src={avatarUrl} alt={`${name}'s avatar`} data-testid="avatar-image-modal" />
          ) : (
            <div data-testid="avatar-fallback-modal">
              {name
                .split(' ')
                .map((n) => n[0])
                .join('')}
            </div>
          )}
          <button data-testid="modal-close" onClick={onClose}>
            Close
          </button>
        </div>
      ) : null,
  };
});

vi.mock('@/organisms/AvatarWithFallback/AvatarWithFallback', () => {
  return {
    AvatarWithFallback: ({
      avatarUrl,
      name,
      className,
      fallbackClassName,
      alt,
    }: {
      avatarUrl?: string;
      name: string;
      className?: string;
      fallbackClassName?: string;
      alt?: string;
    }) => (
      <div data-testid="avatar" className={className}>
        {avatarUrl ? (
          <img src={avatarUrl} alt={alt || name} data-testid="avatar-image" />
        ) : (
          <div data-testid="avatar-fallback" className={fallbackClassName}>
            {name
              .split(' ')
              .map((n) => n[0])
              .join('')}
          </div>
        )}
      </div>
    ),
  };
});

// Note: ProfilePageHeader no longer has auth logic - it was moved to parent components
// (ProfileProfile, ProfilePageContainer). The Follow button is always shown when
// onFollowToggle is provided, and auth is handled on click in the parent.

const mockProps: ProfilePageHeaderProps = {
  profile: {
    name: 'Satoshi Nakamoto',
    bio: 'Authored the Bitcoin white paper, developed Bitcoin, mined first block, disappeared.',
    publicKey: '1QX7GKW3abcdef1234567890',
    status: 'Vacationing',
    emoji: '🌴',
    link: 'https://example.com',
  },
  actions: {
    onEdit: vi.fn(),
    onCopyPublicKey: vi.fn(),
    onCopyLink: vi.fn(),
    onSignOut: vi.fn(),
    onStatusChange: vi.fn(),
    onAvatarClick: vi.fn(),
    isLoggingOut: false,
    followLoadingAction: null,
  },
  isOwnProfile: true,
  userId: '1QX7GKW3abcdef1234567890',
  stats: {
    notifications: 0,
    posts: 0,
    replies: 0,
    followers: 83,
    following: 0,
    friends: 0,
    uniqueTags: 0,
  },
};

const mockOtherUserProps: ProfilePageHeaderProps = {
  profile: {
    name: 'Other User',
    bio: 'Some bio',
    publicKey: 'other123456789012345',
    status: 'Active',
    emoji: '🎉',
    link: 'https://example.com/other',
  },
  actions: {
    onCopyPublicKey: vi.fn(),
    onCopyLink: vi.fn(),
    onAvatarClick: vi.fn(),
    onFollowToggle: vi.fn(),
    isFollowLoading: false,
    isFollowing: false,
    followLoadingAction: null,
  },
  isOwnProfile: false,
  userId: 'other123456789012345',
};

describe('ProfilePageHeader', () => {
  it('renders name and bio correctly', () => {
    render(<ProfilePageHeader {...mockProps} />);

    expect(screen.getByText('Satoshi Nakamoto')).toBeInTheDocument();
    expect(
      screen.getByText('Authored the Bitcoin white paper, developed Bitcoin, mined first block, disappeared.'),
    ).toBeInTheDocument();
  });

  it('renders formatted public key', () => {
    render(<ProfilePageHeader {...mockProps} />);

    // formatPublicKey with length 8: first 4 + ... + last 4 (no pubky prefix)
    expect(screen.getAllByText(/1QX7\.\.\.7890/)).toHaveLength(2);
  });

  it('renders all action buttons', () => {
    render(<ProfilePageHeader {...mockProps} />);

    expect(screen.getByText('Edit profile')).toBeInTheDocument();
    expect(screen.getAllByText(/1QX7\.\.\.7890/)).toHaveLength(2);
    expect(screen.getByText('Profile link')).toBeInTheDocument();
    expect(screen.getByText('Sign out')).toBeInTheDocument();
    expect(screen.getByText('Vacationing')).toBeInTheDocument();
    expect(screen.getByText(`83 ${enMessages.userList.followers}`)).toBeInTheDocument();
  });

  it('renders the status picker when own profile has no status', () => {
    const props = { ...mockProps, profile: { ...mockProps.profile, status: '' } };

    render(<ProfilePageHeader {...props} />);

    expect(screen.getByText('No Status')).toBeInTheDocument();
  });

  it('calls onEdit when Edit button is clicked', () => {
    const onEdit = vi.fn();
    const props = { ...mockProps, actions: { ...mockProps.actions, onEdit } };
    render(<ProfilePageHeader {...props} />);

    const editButton = screen.getByText('Edit profile').closest('button');
    fireEvent.click(editButton!);

    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it('calls onCopyPublicKey when public key button is clicked', () => {
    const onCopyPublicKey = vi.fn();
    const props = { ...mockProps, actions: { ...mockProps.actions, onCopyPublicKey } };
    render(<ProfilePageHeader {...props} />);

    const publicKeyButton = document.querySelector('[data-cy="profile-copy-pubkey-btn"]');
    fireEvent.click(publicKeyButton!);

    expect(onCopyPublicKey).toHaveBeenCalledTimes(1);
  });

  it('calls onSignOut when Sign out button is clicked', () => {
    const onSignOut = vi.fn();
    const props = { ...mockProps, actions: { ...mockProps.actions, onSignOut } };
    render(<ProfilePageHeader {...props} />);

    const signOutButton = screen.getByText('Sign out').closest('button');
    fireEvent.click(signOutButton!);

    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it('calls onCopyLink when Link button is clicked', () => {
    const onCopyLink = vi.fn();
    const props = { ...mockProps, actions: { ...mockProps.actions, onCopyLink } };
    render(<ProfilePageHeader {...props} />);

    const linkButton = screen.getByText('Profile link').closest('button');
    fireEvent.click(linkButton!);

    expect(onCopyLink).toHaveBeenCalledTimes(1);
  });

  it('renders avatar with fallback initials when no avatarUrl', () => {
    const props = { ...mockProps, profile: { ...mockProps.profile, avatarUrl: undefined } };
    render(<ProfilePageHeader {...props} />);

    expect(screen.getByText('SN')).toBeInTheDocument();
  });

  it('renders emoji badge', () => {
    render(<ProfilePageHeader {...mockProps} />);

    // Emoji appears in both badge and status picker, so check for multiple instances
    const emojis = screen.getAllByText('🌴');
    expect(emojis.length).toBeGreaterThan(0);
  });

  it('renders without bio', () => {
    const props = { ...mockProps, profile: { ...mockProps.profile, bio: undefined } };
    render(<ProfilePageHeader {...props} />);

    expect(screen.getByText('Satoshi Nakamoto')).toBeInTheDocument();
    expect(
      screen.queryByText('Authored the Bitcoin white paper, developed Bitcoin, mined first block, disappeared.'),
    ).not.toBeInTheDocument();
  });

  it('calls onAvatarClick when avatar is clicked', () => {
    const onAvatarClick = vi.fn();
    const props = {
      ...mockProps,
      actions: { ...mockProps.actions, onAvatarClick },
    };
    render(<ProfilePageHeader {...props} />);

    const containers = screen.getAllByTestId('container');
    const avatarContainer = containers.find((c) => c.className.includes('cursor-pointer'));
    fireEvent.click(avatarContainer!);

    expect(onAvatarClick).toHaveBeenCalledTimes(1);
  });
});

describe('ProfilePageHeader - Snapshots', () => {
  it('matches snapshot', () => {
    const { container } = render(<ProfilePageHeader {...mockProps} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});

describe('ProfilePageHeader - Mobile Snapshots', () => {
  beforeEach(() => {
    setMobileViewport();
  });

  afterEach(() => {
    resetViewport();
  });

  it('matches snapshot on mobile viewport', () => {
    const { container } = render(<ProfilePageHeader {...mockProps} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});

describe('ProfilePageHeader - Other User Profile', () => {
  it('shows Follow button when viewing other user and not following', () => {
    render(<ProfilePageHeader {...mockOtherUserProps} />);

    expect(screen.getByText('Follow')).toBeInTheDocument();
  });

  it('shows Following button when viewing other user and following', () => {
    const props = {
      ...mockOtherUserProps,
      actions: { ...mockOtherUserProps.actions, isFollowing: true },
    };
    render(<ProfilePageHeader {...props} />);

    expect(screen.getByText('Following')).toBeInTheDocument();
  });

  it('shows Following... while follow action is loading even if isFollowing has updated', () => {
    const props = {
      ...mockOtherUserProps,
      actions: {
        ...mockOtherUserProps.actions,
        isFollowing: true,
        isFollowLoading: true,
        followLoadingAction: FOLLOW_ACTIONS.FOLLOW,
      },
    };
    render(<ProfilePageHeader {...props} />);

    expect(screen.getByText('Following...')).toBeInTheDocument();
    expect(screen.queryByText('Unfollowing...')).not.toBeInTheDocument();
  });

  it('shows Unfollowing... while unfollow action is loading even if isFollowing has updated', () => {
    const props = {
      ...mockOtherUserProps,
      actions: {
        ...mockOtherUserProps.actions,
        isFollowing: false,
        isFollowLoading: true,
        followLoadingAction: FOLLOW_ACTIONS.UNFOLLOW,
      },
    };
    render(<ProfilePageHeader {...props} />);

    expect(screen.getByText('Unfollowing...')).toBeInTheDocument();
    expect(screen.queryByText('Following...')).not.toBeInTheDocument();
  });

  it('renders Unfollow text for hover state when following', () => {
    const props = {
      ...mockOtherUserProps,
      actions: { ...mockOtherUserProps.actions, isFollowing: true },
    };
    render(<ProfilePageHeader {...props} />);

    // Both "Following" and "Unfollow" are in the DOM (CSS group-hover swaps visibility)
    const followingText = screen.getByText('Following');
    const unfollowText = screen.getByText('Unfollow');
    expect(followingText).toBeInTheDocument();
    expect(unfollowText).toBeInTheDocument();

    // Verify the button has "group" class to enable group-hover for children
    const button = followingText.closest('button');
    expect(button).toHaveClass('group');

    // Verify CSS classes that swap visibility on hover
    expect(followingText.closest('div')).toHaveClass('group-hover:hidden');
    expect(unfollowText.closest('div')).toHaveClass('group-hover:flex');
  });

  it('hides Edit, Sign out buttons when viewing other user', () => {
    render(<ProfilePageHeader {...mockOtherUserProps} />);

    expect(screen.queryByText('Edit')).not.toBeInTheDocument();
    expect(screen.queryByText('Sign out')).not.toBeInTheDocument();
  });

  it('shows Copy Key and Link buttons when viewing other user', () => {
    render(<ProfilePageHeader {...mockOtherUserProps} />);

    // formatPublicKey with length 8: first 4 + ... + last 4 (no pubky prefix)
    // For 'other123456789012345', it should be 'othe...2345'
    expect(screen.getAllByText(/othe\.\.\.2345/)).toHaveLength(2);
    expect(screen.getByText('Link')).toBeInTheDocument();
  });

  it('calls onFollowToggle when Follow button is clicked', () => {
    const onFollowToggle = vi.fn();
    const props = {
      ...mockOtherUserProps,
      actions: { ...mockOtherUserProps.actions, onFollowToggle },
    };
    render(<ProfilePageHeader {...props} />);

    const followButton = screen.getByText('Follow').closest('button');
    fireEvent.click(followButton!);

    expect(onFollowToggle).toHaveBeenCalledTimes(1);
  });

  it('shows status inline with buttons when viewing other user', () => {
    render(<ProfilePageHeader {...mockOtherUserProps} />);

    // The status should be shown inline with buttons (emoji and text in separate elements)
    // Emoji appears both in avatar badge and status display
    const emojis = screen.getAllByText('🎉');
    expect(emojis.length).toBeGreaterThanOrEqual(2); // Badge + status
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('always shows Follow button when onFollowToggle is provided (auth handled by parent)', () => {
    // Note: Auth check was moved to parent components (ProfileProfile, ProfilePageContainer).
    // The ProfilePageHeader always shows the Follow button when onFollowToggle is provided.
    // Auth is triggered on click, not on render.
    render(<ProfilePageHeader {...mockOtherUserProps} />);

    expect(screen.getByText('Follow')).toBeInTheDocument();
  });
});
