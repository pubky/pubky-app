import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProfileProfile } from './ProfileProfile';
import { AUTH_ROUTES } from '@/app/routes';

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
    isLoading: false,
    handleTagToggle: vi.fn(),
  })),
}));

// Mock molecules
vi.mock('@/molecules/ProfilePageLinks/ProfilePageLinks', () => {
  return {
    ProfilePageLinks: () => <div data-testid="profile-page-links">Links section</div>,
  };
});

vi.mock('@/molecules/ProfilePageTaggedAs/ProfilePageTaggedAs', () => {
  return {
    ProfilePageTaggedAs: () => <div data-testid="profile-page-tagged-as">Tagged as section</div>,
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
      };
    }) => (
      <div data-testid="profile-page-header">
        <div>{profile.name}</div>
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
  it('renders without errors', () => {
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

  it('matches snapshot', () => {
    const { container } = render(<ProfileProfile />);
    expect(container).toMatchSnapshot();
  });
});
