import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTH_ROUTES } from '@/app/routes';
import { useProfileHeader } from '@/hooks/useProfileHeader/useProfileHeader';
import { useTagged } from '@/hooks/useTagged/useTagged';
import { useProfileContext } from '@/providers/ProfileProvider/ProfileProvider';
import { NexusSocialGraphStatus } from '@/services/nexus/nexus.types';
import { PUBKY_52_STAGING_FIXTURE } from '@/test-utils/pubky';
import { ProfileProfile } from './ProfileProfile';

const mockProfilePubky = PUBKY_52_STAGING_FIXTURE;

// Mock next/navigation
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({
    push: mockPush,
  })),
}));

// Mock dependencies
vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: vi.fn(() => ({
    currentUserPubky: 'pubky1QX7GKW3abcdef1234567890',
  })),
}));
vi.mock('@/stores/notification/notification.store', () => ({
  useNotificationStore: vi.fn(() => 0),
}));

vi.mock('@/providers/ProfileProvider/ProfileProvider', () => ({
  useProfileContext: vi.fn(() => ({
    pubky: mockProfilePubky,
    isOwnProfile: true,
    isLoading: false,
  })),
}));

// Mock hooks
vi.mock('@/hooks/useProfileHeader/useProfileHeader', () => ({
  useProfileHeader: vi.fn(() => ({
    profile: {
      name: 'Satoshi Nakamoto',
      bio: 'Authored the Bitcoin white paper, developed Bitcoin, mined first block, disappeared.',
      publicKey: 'pubky1QX7GKW3abcdef1234567890',
      emoji: '🌴',
      status: 'Vacationing',
      avatarUrl: undefined,
      link: 'http://localhost:3000/profile/1QX7GKW3abcdef1234567890',
      links: [],
    },
    stats: {
      posts: 42,
      following: 10,
      followers: 100,
      tagged: 7,
      collections: 0,
      uniqueTags: 12,
    },
    actions: {
      onEdit: vi.fn(),
      onCopyPublicKey: vi.fn(),
      onCopyLink: vi.fn(),
      onSignOut: vi.fn(() => {
        mockPush(AUTH_ROUTES.LOGOUT);
      }),
      onStatusClick: vi.fn(),
    },
    isLoading: false,
    isProfileLoading: false,
  })),
}));

vi.mock('@/hooks/useRequireAuth/useRequireAuth', () => ({
  useRequireAuth: vi.fn(() => ({
    isAuthenticated: true,
    requireAuth: vi.fn((callback) => callback()),
  })),
}));

vi.mock('@/hooks/useFollowUser/useFollowUser', () => ({
  useFollowUser: vi.fn(() => ({
    toggleFollow: vi.fn(),
    isLoading: false,
    loadingAction: null,
  })),
}));

vi.mock('@/hooks/useIsFollowing/useIsFollowing', () => ({
  useIsFollowing: vi.fn(() => ({
    isFollowing: false,
  })),
}));

vi.mock('@/hooks/useTagged/useTagged', () => ({
  useTagged: vi.fn(() => ({
    tags: [],
    count: 12,
    isLoading: false,
    handleTagAdd: vi.fn(),
    handleTagToggle: vi.fn(),
  })),
}));

const mockUseSocialGraphStatus = vi.fn((_pubky?: string | null) => ({
  status: null as NexusSocialGraphStatus | null,
  isLoading: false,
}));
vi.mock('@/hooks/useSocialGraphStatus/useSocialGraphStatus', () => ({
  useSocialGraphStatus: (pubky: string | null) => mockUseSocialGraphStatus(pubky),
}));

// Mock molecules
vi.mock('@/molecules/ProfilePageLinks/ProfilePageLinks', () => {
  return {
    ProfilePageLinks: () => <div data-testid="profile-page-links">Links section</div>,
  };
});

const { mockProfilePageTaggedAs } = vi.hoisted(() => ({
  mockProfilePageTaggedAs: vi.fn(),
}));

vi.mock('@/molecules/ProfilePageTaggedAs/ProfilePageTaggedAs', () => {
  return {
    ProfilePageTaggedAs: (props: Record<string, unknown>) => {
      mockProfilePageTaggedAs(props);
      return <div data-testid="profile-page-tagged-as">Tagged as section</div>;
    },
  };
});

vi.mock('@/molecules/ProfilePageSocialGraph/ProfilePageSocialGraph', () => {
  return {
    ProfilePageSocialGraph: ({ status }: { status: string }) => (
      <div data-testid="profile-page-social-graph" data-status={status}>
        Social graph section
      </div>
    ),
  };
});

// Mock the avatar renderer inside the modal: the real one reads moderation state from Dexie.
vi.mock('@/organisms/AvatarWithFallback/AvatarWithFallback', () => {
  return {
    AvatarWithFallback: ({
      avatarUrl,
      name,
      fallbackSeed,
      alt,
    }: {
      avatarUrl?: string;
      name: string;
      fallbackSeed?: string;
      alt?: string;
    }) => (
      <div
        data-testid="avatar-zoom-image"
        data-avatar-url={avatarUrl}
        data-name={name}
        data-fallback-seed={fallbackSeed}
      >
        {avatarUrl ? <img src={avatarUrl} alt={alt || name} /> : <span data-testid="avatar-zoom-fallback">{name}</span>}
      </div>
    ),
  };
});

// Mock organisms
vi.mock('@/organisms/ProfilePageHeader/ProfilePageHeader', () => {
  return {
    ProfilePageHeader: ({
      profile,
      actions,
    }: {
      profile: {
        name: string;
        bio?: string;
        publicKey: string;
        emoji?: string;
        status: string;
        link?: string;
        avatarUrl?: string;
      };
      actions: {
        onEdit?: () => void;
        onCopyPublicKey?: () => void;
        onCopyLink?: () => void;
        onSignOut?: () => void;
        onStatusClick?: () => void;
        onAvatarClick?: () => void;
      };
    }) => (
      <div data-testid="profile-page-header">
        <div>{profile.name}</div>
        {actions.onAvatarClick && (
          <button data-testid="avatar-button" onClick={actions.onAvatarClick}>
            Avatar
          </button>
        )}
        {profile.bio && <div>{profile.bio}</div>}
        <div>{profile.publicKey}</div>
        {profile.emoji && <div>{profile.emoji}</div>}
        <div>{profile.status}</div>
        {actions.onEdit && <button onClick={actions.onEdit}>Edit</button>}
        {actions.onCopyPublicKey && <button onClick={actions.onCopyPublicKey}>Copy Key</button>}
        {profile.link && <a href={profile.link}>Link</a>}
        {actions.onSignOut && <button onClick={actions.onSignOut}>Sign out</button>}
        {actions.onStatusClick && <button onClick={actions.onStatusClick}>Status</button>}
      </div>
    ),
  };
});

describe('ProfileProfile', () => {
  beforeEach(() => {
    vi.mocked(useProfileContext).mockReturnValue({
      pubky: mockProfilePubky,
      isOwnProfile: true,
      isLoading: false,
    });
    mockUseSocialGraphStatus.mockReturnValue({ status: null, isLoading: false });
  });

  it('renders without errors', () => {
    render(<ProfileProfile />);
    expect(screen.getByTestId('profile-page-header')).toBeInTheDocument();
  });

  it('hides the social graph section when no tier is known', () => {
    render(<ProfileProfile />);
    expect(screen.queryByTestId('profile-page-social-graph')).not.toBeInTheDocument();
  });

  it('renders the social graph section between the header and tags when a tier is known', () => {
    mockUseSocialGraphStatus.mockReturnValue({ status: NexusSocialGraphStatus.NEW, isLoading: false });
    const { container } = render(<ProfileProfile />);

    expect(mockUseSocialGraphStatus).toHaveBeenCalledWith(mockProfilePubky);
    const section = screen.getByTestId('profile-page-social-graph');
    expect(section).toHaveAttribute('data-status', 'new');
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.children[1]).toBe(section);
    expect(wrapper.children[2]).toBe(screen.getByTestId('profile-page-tagged-as'));
  });

  it('shows ProfilePageHeader when profile is ready even if stats are still loading', () => {
    vi.mocked(useProfileHeader).mockReturnValueOnce({
      profile: {
        name: 'Satoshi Nakamoto',
        bio: 'Authored the Bitcoin white paper, developed Bitcoin, mined first block, disappeared.',
        publicKey: 'pubky1QX7GKW3abcdef1234567890',
        emoji: '🌴',
        status: 'Vacationing',
        avatarUrl: undefined,
        link: 'http://localhost:3000/profile/1QX7GKW3abcdef1234567890',
        links: [],
      },
      stats: {
        notifications: 0,
        posts: 42,
        replies: 0,
        following: 10,
        followers: 100,
        friends: 0,
        collections: 0,
        uniqueTags: 12,
      },
      actions: {
        onEdit: vi.fn(),
        onCopyPublicKey: vi.fn(),
        onCopyLink: vi.fn(),
        onSignOut: vi.fn(),
        onStatusChange: vi.fn(),
        isLoggingOut: false,
      },
      isLoading: true,
      isProfileLoading: false,
      userNotFound: false,
    });

    render(<ProfileProfile />);

    expect(screen.getByTestId('profile-page-header')).toBeInTheDocument();
  });

  it('displays ProfilePageHeader with correct props', () => {
    render(<ProfileProfile />);

    expect(screen.getByText('Satoshi Nakamoto')).toBeInTheDocument();
    expect(
      screen.getByText('Authored the Bitcoin white paper, developed Bitcoin, mined first block, disappeared.'),
    ).toBeInTheDocument();
    expect(screen.getByText('pubky1QX7GKW3abcdef1234567890')).toBeInTheDocument();
    expect(screen.getByText('🌴')).toBeInTheDocument();
    expect(screen.getByText('Vacationing')).toBeInTheDocument();
  });

  it('is hidden on large screens', () => {
    const { container } = render(<ProfileProfile />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveClass('lg:hidden');
  });

  it('navigates to logout page when sign out is clicked', () => {
    render(<ProfileProfile />);
    const signOutButton = screen.getByText('Sign out');
    fireEvent.click(signOutButton);

    expect(mockPush).toHaveBeenCalledWith(AUTH_ROUTES.LOGOUT);
  });

  it('renders the tagged section in the mobile variant with the total tag count', () => {
    render(<ProfileProfile />);

    expect(mockProfilePageTaggedAs).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: 'mobile',
        count: 12,
        onTagAdd: expect.any(Function),
      }),
    );
  });

  it('loads the total tag count for the tagged section', () => {
    render(<ProfileProfile />);

    expect(vi.mocked(useTagged)).toHaveBeenCalledWith(mockProfilePubky, {
      enablePagination: false,
      enableStats: true,
    });
  });

  it('matches snapshot', () => {
    const { container } = render(<ProfileProfile />);
    expect(container).toMatchSnapshot();
  });

  describe('avatar zoom', () => {
    it('does not render the zoom modal before the avatar is clicked', () => {
      render(<ProfileProfile />);

      expect(screen.queryByTestId('avatar-zoom-modal-overlay')).not.toBeInTheDocument();
    });

    it('opens the zoom modal when the avatar is clicked', () => {
      render(<ProfileProfile />);

      fireEvent.click(screen.getByTestId('avatar-button'));

      expect(screen.getByTestId('avatar-zoom-modal-overlay')).toBeInTheDocument();
      const image = screen.getByTestId('avatar-zoom-image');
      expect(image).toHaveAttribute('data-name', 'Satoshi Nakamoto');
      expect(image).toHaveAttribute('data-fallback-seed', mockProfilePubky);
    });

    it('opens the zoom modal on another user profile', () => {
      vi.mocked(useProfileContext).mockReturnValue({
        pubky: mockProfilePubky,
        isOwnProfile: false,
        isLoading: false,
      });

      render(<ProfileProfile />);
      fireEvent.click(screen.getByTestId('avatar-button'));

      expect(screen.getByTestId('avatar-zoom-modal-overlay')).toBeInTheDocument();
    });

    it('closes the zoom modal on Escape', () => {
      render(<ProfileProfile />);

      fireEvent.click(screen.getByTestId('avatar-button'));
      expect(screen.getByTestId('avatar-zoom-modal-overlay')).toBeInTheDocument();

      fireEvent.keyDown(document, { key: 'Escape' });

      expect(screen.queryByTestId('avatar-zoom-modal-overlay')).not.toBeInTheDocument();
    });

    it('closes the zoom modal when the backdrop is clicked', () => {
      render(<ProfileProfile />);

      fireEvent.click(screen.getByTestId('avatar-button'));
      fireEvent.click(screen.getByTestId('avatar-zoom-modal-overlay'));

      expect(screen.queryByTestId('avatar-zoom-modal-overlay')).not.toBeInTheDocument();
    });

    it('opens the zoom modal with the initials fallback when the profile has no avatar', () => {
      vi.mocked(useProfileHeader).mockReturnValueOnce({
        profile: {
          name: 'Satoshi Nakamoto',
          bio: '',
          publicKey: 'pubky1QX7GKW3abcdef1234567890',
          emoji: '🌴',
          status: '',
          avatarUrl: undefined,
          link: '',
          links: [],
        },
        stats: {
          notifications: 0,
          posts: 0,
          replies: 0,
          following: 0,
          followers: 0,
          friends: 0,
          collections: 0,
          uniqueTags: 0,
        },
        actions: {
          onEdit: vi.fn(),
          onCopyPublicKey: vi.fn(),
          onCopyLink: vi.fn(),
          onSignOut: vi.fn(),
          onStatusChange: vi.fn(),
          isLoggingOut: false,
        },
        isLoading: false,
        isProfileLoading: false,
        userNotFound: false,
      });

      render(<ProfileProfile />);
      fireEvent.click(screen.getByTestId('avatar-button'));

      const image = screen.getByTestId('avatar-zoom-image');
      expect(image).not.toHaveAttribute('data-avatar-url');
      expect(screen.getByTestId('avatar-zoom-fallback')).toHaveTextContent('Satoshi Nakamoto');
    });
  });
});
