import { fireEvent, render as rtlRender, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/atoms/Tooltip/Tooltip';
import { FOLLOW_ACTIONS } from '@/hooks/useFollowUser/useFollowUser.types';
import { resetViewport, setMobileViewport } from '@/test-utils/viewport';
import { ProfilePageHeader } from './ProfilePageHeader';
import { ProfilePageHeaderProps } from './ProfilePageHeader.types';

const render = (ui: ReactElement) => rtlRender(<TooltipProvider delayDuration={0}>{ui}</TooltipProvider>);

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
    status: 'vacationing',
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
    collections: 0,
    uniqueTags: 0,
  },
};

const mockOtherUserProps: ProfilePageHeaderProps = {
  profile: {
    name: 'Other User',
    bio: 'Some bio',
    publicKey: 'other123456789012345',
    status: '🎉 Active',
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

    expect(screen.getByText('Satoshi Nakamoto')).toHaveClass('leading-8', 'lg:leading-none');
    expect(
      screen.getByText('Authored the Bitcoin white paper, developed Bitcoin, mined first block, disappeared.'),
    ).toBeInTheDocument();
  });

  it('uses the original responsive spacing between profile sections', () => {
    render(<ProfilePageHeader {...mockProps} />);

    const header = screen.getByTestId('profile-page-header');
    const bio = document.querySelector('[data-cy="profile-bio-header"]');
    const actions = screen.getByText('Edit profile').closest('button')?.parentElement;

    expect(header).toHaveClass('gap-y-3');
    expect(bio?.parentElement).toHaveClass('lg:gap-3');
    expect(bio?.nextElementSibling).toBe(actions);
    expect(actions).not.toHaveClass('lg:mt-3');
  });

  it('constrains long names so they truncate before the status emoji', () => {
    const props = {
      ...mockProps,
      profile: { ...mockProps.profile, name: `Bobi${'W'.repeat(80)}` },
    };

    render(<ProfilePageHeader {...props} />);

    const name = screen.getByRole('heading', { name: props.profile.name });
    const nameRow = name.parentElement;
    const statusEmoji = screen.getByRole('button', { name: 'Vacationing status' });

    expect(nameRow).toHaveClass('w-full', 'min-w-0');
    expect(name).toHaveClass('min-w-0', 'truncate');
    expect(name.nextElementSibling).toBe(statusEmoji);
    expect(statusEmoji).toHaveClass('shrink-0');
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
    expect(screen.getByText('83 FOLLOWERS')).toBeInTheDocument();
  });

  it('places the status picker below the action buttons on mobile', () => {
    render(<ProfilePageHeader {...mockProps} />);

    const statusPicker = screen.getByText('Vacationing').closest('button')?.parentElement;

    expect(statusPicker).toHaveClass('order-last', 'col-span-2', 'lg:order-0', 'lg:col-auto');
  });

  it('renders the status picker without an emoji when own profile chooses no status', () => {
    const props = { ...mockProps, profile: { ...mockProps.profile, status: 'noStatus' } };

    render(<ProfilePageHeader {...props} />);

    expect(screen.getByText('No Status')).toBeInTheDocument();
    expect(screen.queryByText('💭')).not.toBeInTheDocument();
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

  it('renders the status emoji after the name instead of on the avatar', () => {
    render(<ProfilePageHeader {...mockProps} />);

    const name = screen.getByText('Satoshi Nakamoto');
    const statusEmoji = screen.getByRole('button', { name: 'Vacationing status' });

    expect(name.nextElementSibling).toBe(statusEmoji);
    expect(screen.getByTestId('avatar').parentElement).not.toHaveTextContent('🌴');
  });

  it('does not add a fallback emoji to a text-only custom status', () => {
    const props = { ...mockProps, profile: { ...mockProps.profile, status: 'Focused' } };

    render(<ProfilePageHeader {...props} />);

    expect(screen.getByText('Satoshi Nakamoto').nextElementSibling).toBeNull();
    expect(screen.queryByRole('button', { name: 'Focused status' })).not.toBeInTheDocument();
    expect(screen.queryByText('🌴')).not.toBeInTheDocument();
  });

  it('shows the status label in a tooltip when the profile emoji is hovered', async () => {
    const user = userEvent.setup();

    render(<ProfilePageHeader {...mockProps} />);

    await user.hover(screen.getByRole('button', { name: 'Vacationing status' }));

    await waitFor(() => {
      expect(screen.getByRole('tooltip')).toHaveTextContent('Vacationing');
      expect(document.querySelector('[data-slot="tooltip-content"]')).toHaveClass(
        'bg-accent',
        'font-medium',
        'text-foreground',
        '[&_svg]:fill-accent',
      );
    });
  });

  it('shows the status label when the profile emoji is tapped', async () => {
    render(<ProfilePageHeader {...mockProps} />);

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Vacationing status' }), { pointerType: 'touch' });

    await waitFor(() => {
      expect(screen.getByRole('tooltip')).toHaveTextContent('Vacationing');
    });
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

  it('shows another user status only beside their name', () => {
    render(<ProfilePageHeader {...mockOtherUserProps} />);

    const name = screen.getByText('Other User');
    const statusEmoji = screen.getByRole('button', { name: 'Active status' });

    expect(name.nextElementSibling).toBe(statusEmoji);
    expect(screen.getAllByText('🎉')).toHaveLength(1);
    expect(screen.queryByText('Active')).not.toBeInTheDocument();
  });

  it('always shows Follow button when onFollowToggle is provided (auth handled by parent)', () => {
    // Note: Auth check was moved to parent components (ProfileProfile, ProfilePageContainer).
    // The ProfilePageHeader always shows the Follow button when onFollowToggle is provided.
    // Auth is triggered on click, not on render.
    render(<ProfilePageHeader {...mockOtherUserProps} />);

    expect(screen.getByText('Follow')).toBeInTheDocument();
  });
});
